import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCommission,
  isQualifyingFtd,
  netGamingRevenueEur,
  roundCents,
  toEur,
} from './commission.ts';

describe('toEur', () => {
  it('converts GBP at 1.15 and leaves EUR alone', () => {
    assert.equal(roundCents(toEur(100, 'GBP')), 115);
    assert.equal(toEur(100, 'EUR'), 100);
  });
});

describe('isQualifyingFtd', () => {
  it('qualifies at exactly €20 and not below', () => {
    assert.equal(isQualifyingFtd({ amount: 20, currency: 'EUR' }), true);
    assert.equal(isQualifyingFtd({ amount: 19.99, currency: 'EUR' }), false);
  });

  it('applies the threshold after converting GBP', () => {
    assert.equal(isQualifyingFtd({ amount: 18, currency: 'GBP' }), true); // €20.70
    assert.equal(isQualifyingFtd({ amount: 17, currency: 'GBP' }), false); // €19.55
  });
});

describe('netGamingRevenueEur', () => {
  it('sums bets − wins − bonuses across days and currencies', () => {
    const ngr = netGamingRevenueEur([
      {
        date: '2026-10-01',
        bets: 340,
        wins: 295.5,
        bonuses: 10,
        currency: 'EUR',
      }, // 34.50
      { date: '2026-10-02', bets: 100, wins: 0, bonuses: 0, currency: 'GBP' }, // 115.00
      { date: '2026-10-03', bets: 10, wins: 50, bonuses: 0, currency: 'EUR' }, // −40.00
    ]);
    assert.equal(Math.round(ngr * 100) / 100, 109.5);
  });
});

describe('calculateCommission', () => {
  const ftds = [
    { amount: 50, currency: 'EUR' as const },
    { amount: 15, currency: 'EUR' as const }, // non-qualifying
    { amount: 20, currency: 'GBP' as const },
  ];
  const activity = [
    {
      date: '2026-10-05',
      bets: 1000,
      wins: 600,
      bonuses: 100,
      currency: 'EUR' as const,
    },
  ]; // NGR 300

  it('pays CPA only on qualifying FTDs', () => {
    assert.deepEqual(calculateCommission('cpa', ftds, activity), {
      cpa: 200,
      revShare: 0,
      total: 200,
      currency: 'EUR',
    });
  });

  it('pays RevShare on NGR', () => {
    assert.deepEqual(calculateCommission('rev_share', ftds, activity), {
      cpa: 0,
      revShare: 105,
      total: 105,
      currency: 'EUR',
    });
  });

  it('combines both for hybrid deals', () => {
    assert.deepEqual(calculateCommission('hybrid', ftds, activity), {
      cpa: 100,
      revShare: 60,
      total: 160,
      currency: 'EUR',
    });
  });

  it('pays no RevShare on a negative period rather than clawing back', () => {
    const losing = [
      {
        date: '2026-10-05',
        bets: 100,
        wins: 500,
        bonuses: 0,
        currency: 'EUR' as const,
      },
    ];
    assert.equal(calculateCommission('hybrid', ftds, losing).revShare, 0);
    assert.equal(calculateCommission('hybrid', ftds, losing).total, 100);
  });

  it('floors each month separately, so a losing month does not cancel a winning one', () => {
    const twoMonths = [
      {
        date: '2026-10-05',
        bets: 400,
        wins: 300,
        bonuses: 0,
        currency: 'EUR' as const,
      }, // October +100
      {
        date: '2026-11-05',
        bets: 100,
        wins: 400,
        bonuses: 0,
        currency: 'EUR' as const,
      }, // November −300
    ];
    // 35% of October's €100; November pays €0. Netting the range would pay €0.
    assert.equal(calculateCommission('rev_share', [], twoMonths).revShare, 35);
  });

  it('returns zeros with no activity', () => {
    assert.deepEqual(calculateCommission('hybrid', [], []), {
      cpa: 0,
      revShare: 0,
      total: 0,
      currency: 'EUR',
    });
  });
});
