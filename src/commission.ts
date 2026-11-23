import type { Currency, DealType } from './types.ts';

// Pure commission maths: no database access, so it can be unit tested.

export const EUR_PER_GBP = 1.15;
export const QUALIFYING_FTD_EUR = 20;

export type DealTerms = {
  cpaAmount: number; // EUR per qualifying FTD; 0 if the deal has no CPA
  revShareRate: number; // fraction of NGR, e.g. 0.35; 0 if no RevShare
};

// The database only records which deal type an affiliate is on; what each
// deal type pays is defined here.
export const DEAL_TERMS: Record<DealType, DealTerms> = {
  cpa: { cpaAmount: 100, revShareRate: 0 },
  rev_share: { cpaAmount: 0, revShareRate: 0.35 },
  hybrid: { cpaAmount: 50, revShareRate: 0.2 },
};

export type Money = { amount: number; currency: Currency };

export type Activity = {
  date: string; // YYYY-MM-DD
  bets: number;
  wins: number;
  bonuses: number;
  currency: Currency;
};

export type Commission = {
  cpa: number;
  revShare: number;
  total: number;
  currency: 'EUR';
};

export function toEur(amount: number, currency: Currency): number {
  return currency === 'GBP' ? amount * EUR_PER_GBP : amount;
}

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

// Compared at cent precision so float noise can't push €20.00 below the line.
export function isQualifyingFtd(ftd: Money): boolean {
  return roundCents(toEur(ftd.amount, ftd.currency)) >= QUALIFYING_FTD_EUR;
}

// NGR = bets − wins − bonuses, summed over the period in EUR.
export function netGamingRevenueEur(activity: Activity[]): number {
  return activity.reduce(
    (sum, a) => sum + toEur(a.bets - a.wins - a.bonuses, a.currency),
    0,
  );
}

// NGR per calendar month (keyed by YYYY-MM).
export function monthlyNgrEur(activity: Activity[]): number[] {
  const byMonth = new Map<string, Activity[]>();
  for (const a of activity) {
    const month = a.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), a]);
  }
  return [...byMonth.values()].map(netGamingRevenueEur);
}

export function calculateCommission(
  dealType: DealType,
  ftds: Money[],
  activity: Activity[],
): Commission {
  const terms = DEAL_TERMS[dealType];

  const qualifyingFtds = ftds.filter(isQualifyingFtd).length;
  const cpa = qualifyingFtds * terms.cpaAmount;

  // RevShare is on monthly NGR: each calendar month stands alone, and a
  // losing month earns nothing rather than a clawback, with no carry-over.
  const revShare =
    monthlyNgrEur(activity).reduce((sum, ngr) => sum + Math.max(0, ngr), 0) *
    terms.revShareRate;

  // Round only the outputs so per-row rounding errors don't accumulate.
  return {
    cpa: roundCents(cpa),
    revShare: roundCents(revShare),
    total: roundCents(cpa + revShare),
    currency: 'EUR',
  };
}
