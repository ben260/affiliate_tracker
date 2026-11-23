import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from './errors.ts';
import {
  parseDailyPlayerActivity,
  parsePlayerEvent,
  parseReportRange,
} from './validation.ts';

const ftd = {
  event: 'ftd',
  clickId: 'click-1',
  playerId: 'P-1',
  transactionId: 'T-1',
  amount: 25,
  currency: 'EUR',
  timestamp: '2026-10-04T18:22:10Z',
};

function assertBadRequest(fn: () => unknown) {
  assert.throws(fn, (err) => err instanceof AppError && err.status === 400);
}

describe('parsePlayerEvent', () => {
  it('maps a valid FTD and normalises its timestamp to UTC', () => {
    const event = parsePlayerEvent(
      { ...ftd, timestamp: '2026-10-04T20:22:10+02:00' },
      'ftd',
    );
    assert.equal(event.created_at, '2026-10-04T18:22:10.000Z');
    assert.equal(event.amount, 25);
  });

  it('drops amount and currency from registrations', () => {
    const event = parsePlayerEvent(ftd, 'registration');
    assert.equal(event.amount, null);
    assert.equal(event.currency, null);
  });

  it('rejects malformed money events', () => {
    for (const bad of [
      { ...ftd, currency: 'USD' },
      { ...ftd, amount: '25' },
      { ...ftd, amount: 0 },
      { ...ftd, amount: undefined },
      { ...ftd, clickId: '' },
      { ...ftd, timestamp: 'yesterday' },
      { ...ftd, timestamp: '2026-10-04T18:22:10' }, // no timezone
    ]) {
      assertBadRequest(() => parsePlayerEvent(bad, 'ftd'));
    }
  });
});

describe('parseDailyPlayerActivity', () => {
  it('rejects dates that do not exist', () => {
    assertBadRequest(() =>
      parseDailyPlayerActivity({
        playerId: 'P-1',
        date: '2026-02-30',
        bets: 10,
        wins: 5,
        bonuses: 0,
        currency: 'EUR',
      }),
    );
  });
});

describe('parseReportRange', () => {
  it('rejects a range that ends before it starts', () => {
    assertBadRequest(() =>
      parseReportRange({ from: '2026-10-31', to: '2026-10-01' }),
    );
  });
});
