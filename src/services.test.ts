import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EventType, PlayerEvent } from './types.ts';

// Must be set before db.ts is loaded, so these imports are dynamic.
process.env.DB_PATH = ':memory:';
await import('../scripts/seed.ts'); // creates the schema in the in-memory database
const { db } = await import('./db.ts');
const { AppError } = await import('./errors.ts');
const {
  buildAffiliateReport,
  recordClick,
  recordDailyPlayerActivity,
  recordPlayerEvent,
} = await import('./services.ts');

let nextTransaction = 0;

beforeEach(() => {
  // Affiliates and campaigns stay as seeded; only the event tables are cleared.
  db.exec(`
    DELETE FROM daily_player_activity;
    DELETE FROM player_events;
    DELETE FROM clicks;
  `);
  nextTransaction = 0;
});

function click(affiliateId: string, at: string): string {
  const url = recordClick(
    affiliateId,
    'CMP-101',
    'banner',
    '203.0.113.1',
    'test-agent',
    new Date(at),
  );
  return new URL(url).searchParams.get('click_id')!;
}

function playerEvent(
  eventType: EventType,
  clickId: string,
  playerId: string,
  at: string,
  amount = 0,
  currency: 'EUR' | 'GBP' = 'EUR',
): PlayerEvent {
  const isMoney = eventType !== 'registration';
  return {
    transaction_id: `T-${++nextTransaction}`,
    click_id: clickId,
    event_type: eventType,
    player_id: playerId,
    amount: isMoney ? amount : null,
    currency: isMoney ? currency : null,
    created_at: new Date(at).toISOString(),
  };
}

function activity(
  playerId: string,
  date: string,
  bets: number,
  wins: number,
  bonuses = 0,
  currency: 'EUR' | 'GBP' = 'EUR',
) {
  recordDailyPlayerActivity({
    player_id: playerId,
    date,
    bets,
    wins,
    bonuses,
    currency,
  });
}

function october(affiliateId: string) {
  return buildAffiliateReport(affiliateId, '2026-10-01', '2026-10-31');
}

function assertRejected(fn: () => void, status: number) {
  assert.throws(fn, (err) => err instanceof AppError && err.status === status);
}

describe('attribution', () => {
  it('rejects a registration outside the 30-day window and never pays its FTD', () => {
    const clickId = click('AFF-001', '2026-08-20T12:00:00Z');

    assertRejected(
      () =>
        recordPlayerEvent(
          playerEvent('registration', clickId, 'P-1', '2026-10-03T12:00:00Z'),
        ),
      422,
    );
    // Accepted, because a registration might still arrive...
    recordPlayerEvent(
      playerEvent('ftd', clickId, 'P-1', '2026-10-03T12:15:00Z', 60),
    );

    // ...but with no accepted registration it must not earn CPA.
    const report = october('AFF-001');
    assert.equal(report.registrations, 0);
    assert.equal(report.ftds, 0);
    assert.equal(report.commission.cpa, 0);
  });

  it('accepts a registration exactly 30 days after the click, but not a second later', () => {
    const clickId = click('AFF-001', '2026-10-01T12:00:00Z');

    recordPlayerEvent(
      playerEvent('registration', clickId, 'P-1', '2026-10-31T12:00:00Z'),
    );
    assertRejected(
      () =>
        recordPlayerEvent(
          playerEvent('registration', clickId, 'P-2', '2026-10-31T12:00:01Z'),
        ),
      422,
    );
  });

  it('counts an FTD that arrives before its registration', () => {
    const clickId = click('AFF-001', '2026-10-01T12:00:00Z');

    recordPlayerEvent(
      playerEvent('ftd', clickId, 'P-1', '2026-10-02T10:00:00Z', 50),
    );
    recordPlayerEvent(
      playerEvent('registration', clickId, 'P-1', '2026-10-02T09:59:00Z'),
    );

    const report = october('AFF-001');
    assert.equal(report.ftds, 1);
    assert.equal(report.commission.cpa, 100);
  });

  it('keeps a player with the affiliate they registered through first', () => {
    const firstClick = click('AFF-002', '2026-10-01T12:00:00Z');
    const laterClick = click('AFF-001', '2026-10-05T12:00:00Z');

    recordPlayerEvent(
      playerEvent('registration', firstClick, 'P-1', '2026-10-01T13:00:00Z'),
    );
    assertRejected(
      () =>
        recordPlayerEvent(
          playerEvent(
            'registration',
            laterClick,
            'P-1',
            '2026-10-05T13:00:00Z',
          ),
        ),
      409,
    );
    assertRejected(
      () =>
        recordPlayerEvent(
          playerEvent('ftd', laterClick, 'P-1', '2026-10-05T13:10:00Z', 80),
        ),
      409,
    );
    activity('P-1', '2026-10-06', 100, 0);

    assert.equal(october('AFF-002').commission.revShare, 35);
    assert.equal(october('AFF-001').commission.total, 0);
  });

  it('stores a resent FTD once and rejects a second FTD, so CPA is paid once', () => {
    const clickId = click('AFF-001', '2026-10-01T12:00:00Z');
    recordPlayerEvent(
      playerEvent('registration', clickId, 'P-1', '2026-10-01T13:00:00Z'),
    );
    const ftd = playerEvent('ftd', clickId, 'P-1', '2026-10-01T13:10:00Z', 50);

    recordPlayerEvent(ftd);
    recordPlayerEvent(ftd); // operator retry: accepted, ignored
    assertRejected(
      () =>
        recordPlayerEvent(
          playerEvent('ftd', clickId, 'P-1', '2026-10-02T09:00:00Z', 50),
        ),
      409,
    );

    assert.equal(october('AFF-001').ftds, 1);
    assert.equal(october('AFF-001').commission.cpa, 100);
  });
});

describe('affiliate report', () => {
  it('builds a hybrid report from clicks, FTDs and activity', () => {
    const clicks = [1, 2, 3, 4].map((day) =>
      click('AFF-003', `2026-10-0${day}T12:00:00Z`),
    );
    recordPlayerEvent(
      playerEvent('registration', clicks[0], 'P-1', '2026-10-01T13:00:00Z'),
    );
    recordPlayerEvent(
      playerEvent('ftd', clicks[0], 'P-1', '2026-10-01T13:10:00Z', 18, 'GBP'), // €20.70: qualifies
    );
    recordPlayerEvent(
      playerEvent('registration', clicks[1], 'P-2', '2026-10-02T13:00:00Z'),
    );
    recordPlayerEvent(
      playerEvent('ftd', clicks[1], 'P-2', '2026-10-02T13:10:00Z', 15), // below €20
    );
    activity('P-1', '2026-10-05', 200, 100, 0, 'GBP'); // NGR €115
    activity('P-2', '2026-10-05', 50, 0, 15); // NGR €35

    assert.deepEqual(october('AFF-003'), {
      affiliateId: 'AFF-003',
      from: '2026-10-01',
      to: '2026-10-31',
      clicks: 4,
      registrations: 2,
      ftds: 2,
      conversionRate: 50,
      commission: { cpa: 50, revShare: 30, total: 80, currency: 'EUR' },
    });
  });

  it('includes both ends of the date range and nothing outside it', () => {
    for (const at of [
      '2026-09-30T23:59:59Z',
      '2026-10-01T00:00:00Z', // first instant of the range
      '2026-10-31T23:59:59Z', // last second of the range
      '2026-11-01T00:00:00Z',
    ]) {
      click('AFF-001', at);
    }

    assert.equal(october('AFF-001').clicks, 2);
  });

  it('rejects an unknown affiliate', () => {
    assertRejected(() => october('AFF-999'), 404);
  });
});
