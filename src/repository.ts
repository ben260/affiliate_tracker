import type {
  Affiliate,
  Campaign,
  Click,
  DailyPlayerActivity,
  EventType,
  PlayerEvent,
} from './types.ts';
import type { Activity, Money } from './commission.ts';
import { db } from './db.ts';

export function getCampaignById(campaignId: string): Campaign | null {
  const row = db
    .prepare('SELECT id, name, url FROM campaigns WHERE id = ?')
    .get(campaignId);

  return row ? (row as Campaign) : null;
}

export function getAffiliateById(affiliateId: string): Affiliate | null {
  const row = db
    .prepare('SELECT id, deal_type FROM affiliates WHERE id = ?')
    .get(affiliateId);

  if (!row) return null;
  return { id: row.id, dealType: row.deal_type } as Affiliate;
}

// Report queries take a half-open UTC range [fromTs, toTs) of ISO timestamps.
// Stored timestamps are all toISOString() output, so text comparison works.

export function countClicks(
  affiliateId: string,
  fromTs: string,
  toTs: string,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM clicks
       WHERE affiliate_id = ? AND created_at >= ? AND created_at < ?`,
    )
    .get(affiliateId, fromTs, toTs);
  return Number(row?.n ?? 0);
}

// Only accepted registrations are stored, so every row is attributed.
export function countRegistrations(
  affiliateId: string,
  fromTs: string,
  toTs: string,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM player_events r
       JOIN clicks c ON c.click_id = r.click_id
       WHERE r.event_type = 'registration'
         AND c.affiliate_id = ? AND r.created_at >= ? AND r.created_at < ?`,
    )
    .get(affiliateId, fromTs, toTs);
  return Number(row?.n ?? 0);
}

// FTDs are only attributed when the player has an accepted registration on
// the same click. FTDs can arrive before their registration, so they're
// stored unattributed and this join decides at report time.
export function getAttributedFtds(
  affiliateId: string,
  fromTs: string,
  toTs: string,
): Money[] {
  return db
    .prepare(
      `SELECT f.amount, f.currency
       FROM player_events f
       JOIN player_events r
         ON r.player_id = f.player_id
        AND r.click_id = f.click_id
        AND r.event_type = 'registration'
       JOIN clicks c ON c.click_id = f.click_id
       WHERE f.event_type = 'ftd'
         AND c.affiliate_id = ? AND f.created_at >= ? AND f.created_at < ?`,
    )
    .all(affiliateId, fromTs, toTs) as Money[];
}

// Daily activity for players whose accepted registration came through one
// of the affiliate's clicks. Dates are inclusive YYYY-MM-DD.
export function getAttributedActivity(
  affiliateId: string,
  fromDate: string,
  toDate: string,
): Activity[] {
  return db
    .prepare(
      `SELECT a.date, a.bets, a.wins, a.bonuses, a.currency
       FROM daily_player_activity a
       JOIN player_events r
         ON r.player_id = a.player_id AND r.event_type = 'registration'
       JOIN clicks c ON c.click_id = r.click_id
       WHERE c.affiliate_id = ? AND a.date >= ? AND a.date <= ?`,
    )
    .all(affiliateId, fromDate, toDate) as Activity[];
}

export function getClickById(clickId: string): Click | null {
  const row = db
    .prepare(
      `SELECT click_id, affiliate_id, campaign_id, sub_id, ip, user_agent, created_at
       FROM clicks WHERE click_id = ?`,
    )
    .get(clickId);

  return row ? (row as Click) : null;
}

export function addClick(click: Click): void {
  db.prepare(
    `INSERT INTO clicks
       (click_id, affiliate_id, campaign_id, sub_id, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    click.click_id,
    click.affiliate_id,
    click.campaign_id,
    click.sub_id,
    click.ip,
    click.user_agent,
    click.created_at,
  );
}

// A resent day replaces the earlier row (treated as a correction).
export function addDailyPlayerActivity(activity: DailyPlayerActivity): void {
  db.prepare(
    `INSERT OR REPLACE INTO daily_player_activity
       (player_id, date, bets, wins, bonuses, currency)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    activity.player_id,
    activity.date,
    activity.bets,
    activity.wins,
    activity.bonuses,
    activity.currency,
  );
}

export function transactionExists(transactionId: string): boolean {
  return (
    db
      .prepare('SELECT 1 FROM player_events WHERE transaction_id = ?')
      .get(transactionId) !== undefined
  );
}

export function playerHasEvent(
  playerId: string,
  eventType: EventType,
): boolean {
  return (
    db
      .prepare(
        'SELECT 1 FROM player_events WHERE player_id = ? AND event_type = ?',
      )
      .get(playerId, eventType) !== undefined
  );
}

// The click a player's accepted registration came through, which decides
// which affiliate owns the player.
export function getRegistrationClickId(playerId: string): string | null {
  const row = db
    .prepare(
      `SELECT click_id FROM player_events
       WHERE player_id = ? AND event_type = 'registration'`,
    )
    .get(playerId);

  return row ? (row.click_id as string) : null;
}

// A resent transaction_id is ignored, so duplicates are stored once.
// An unknown click_id still throws (foreign keys aren't ignored).
export function addPlayerEvent(event: PlayerEvent): void {
  db.prepare(
    `INSERT OR IGNORE INTO player_events
       (transaction_id, click_id, event_type, player_id, amount, currency, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.transaction_id,
    event.click_id,
    event.event_type,
    event.player_id,
    event.amount ?? null, // registrations have no amount or currency
    event.currency ?? null,
    event.created_at,
  );
}
