import { AppError } from './errors.ts';
import type {
  Currency,
  DailyPlayerActivity,
  EventType,
  PlayerEvent,
} from './types.ts';

// Turns untrusted postback bodies into typed records, or throws a 400.

const CURRENCIES: readonly Currency[] = ['EUR', 'GBP'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Body = Record<string, unknown>;

function requireString(body: Body, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(400, `${field} must be a non-empty string`);
  }
  return value;
}

function requireNumber(body: Body, field: string): number {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new AppError(400, `${field} must be a non-negative number`);
  }
  return value;
}

function requireCurrency(body: Body): Currency {
  const value = body.currency;
  if (!CURRENCIES.includes(value as Currency)) {
    throw new AppError(400, `currency must be one of ${CURRENCIES.join(', ')}`);
  }
  return value as Currency;
}

// Normalised to ISO-8601 UTC so stored timestamps compare correctly as text.
// A timezone is required: without one, Date.parse uses the server's local
// time, so the same postback would be stored differently on different servers.
const TIMEZONE_RE = /(Z|[+-]\d{2}:?\d{2})$/i;

export function parseTimestamp(value: string, field: string): string {
  const ms = Date.parse(value);
  if (!TIMEZONE_RE.test(value) || Number.isNaN(ms)) {
    throw new AppError(
      400,
      `${field} must be an ISO-8601 timestamp with a timezone, e.g. 2026-10-04T18:22:10Z`,
    );
  }
  return new Date(ms).toISOString();
}

function requireTimestamp(body: Body, field: string): string {
  return parseTimestamp(requireString(body, field), field);
}

function requireDate(body: Body, field: string): string {
  const value = requireString(body, field);
  // Round-trip catches impossible dates like 2026-02-30.
  if (
    !DATE_RE.test(value) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new AppError(400, `${field} must be a date in YYYY-MM-DD format`);
  }
  return value;
}

export function parsePlayerEvent(
  body: Body,
  eventType: EventType,
): PlayerEvent {
  const base = {
    transaction_id: requireString(body, 'transactionId'),
    click_id: requireString(body, 'clickId'),
    event_type: eventType,
    player_id: requireString(body, 'playerId'),
    created_at: requireTimestamp(body, 'timestamp'),
  };

  // amount and currency only apply to money events; ignore them on registration.
  if (eventType === 'registration') {
    return { ...base, amount: null, currency: null };
  }

  const amount = requireNumber(body, 'amount');
  if (amount === 0) {
    throw new AppError(400, 'amount must be greater than zero');
  }
  return { ...base, amount, currency: requireCurrency(body) };
}

export function parseDailyPlayerActivity(body: Body): DailyPlayerActivity {
  return {
    player_id: requireString(body, 'playerId'),
    date: requireDate(body, 'date'),
    bets: requireNumber(body, 'bets'),
    wins: requireNumber(body, 'wins'),
    bonuses: requireNumber(body, 'bonuses'),
    currency: requireCurrency(body),
  };
}

export type ReportRange = { from: string; to: string };

export function parseReportRange(query: Body): ReportRange {
  const from = requireDate(query, 'from');
  const to = requireDate(query, 'to');
  if (from > to) {
    throw new AppError(400, 'from must not be after to');
  }
  return { from, to };
}
