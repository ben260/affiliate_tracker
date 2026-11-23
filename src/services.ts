import { randomUUID } from 'node:crypto';
import {
  addClick,
  addDailyPlayerActivity,
  addPlayerEvent,
  countClicks,
  countRegistrations,
  getAffiliateById,
  getAttributedActivity,
  getAttributedFtds,
  getCampaignById,
  getClickById,
  getRegistrationClickId,
  playerHasEvent,
  transactionExists,
} from './repository.ts';
import { calculateCommission } from './commission.ts';
import { AppError } from './errors.ts';
import type {
  AffiliateReport,
  DailyPlayerActivity,
  PlayerEvent,
} from './types.ts';

export function recordClick(
  affiliateId: string,
  campaignId: string,
  subId: string,
  ip: string,
  userAgent: string,
  createdAt: Date = new Date(),
): string {
  if (getAffiliateById(affiliateId) === null) {
    throw new AppError(404, 'Unknown affiliate');
  }

  const campaign = getCampaignById(campaignId);
  if (campaign === null) {
    throw new AppError(404, 'Unknown campaign');
  }

  const clickId = randomUUID();

  addClick({
    click_id: clickId,
    affiliate_id: affiliateId,
    campaign_id: campaignId,
    sub_id: subId,
    ip,
    user_agent: userAgent,
    created_at: createdAt.toISOString(),
  });

  const redirectUrl = new URL(campaign.url);
  redirectUrl.searchParams.set('click_id', clickId);
  return redirectUrl.toString();
}

const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function recordPlayerEvent(event: PlayerEvent): void {
  // Operators resend postbacks; an exact resend is accepted and ignored.
  if (transactionExists(event.transaction_id)) {
    return;
  }

  const click = getClickById(event.click_id);
  if (click === null) {
    throw new AppError(404, 'Unknown click');
  }

  if (event.event_type === 'registration') {
    const sinceClick =
      Date.parse(event.created_at) - Date.parse(click.created_at);
    if (sinceClick < 0 || sinceClick > ATTRIBUTION_WINDOW_MS) {
      throw new AppError(422, 'Registration outside attribution window');
    }

    // First registration wins: the player stays with the original affiliate.
    if (playerHasEvent(event.player_id, 'registration')) {
      throw new AppError(409, 'Player already registered');
    }
  } else {
    // Money events must belong to the click the player registered through.
    // If no registration is stored yet the event is still accepted, because
    // operators deliver out of order (an FTD can arrive before its
    // registration). Reports must therefore only count money events that
    // have an accepted registration on the same click; otherwise a player
    // whose registration was rejected (e.g. outside the attribution window)
    // would still earn the affiliate CPA.
    const registrationClickId = getRegistrationClickId(event.player_id);
    if (
      registrationClickId !== null &&
      registrationClickId !== event.click_id
    ) {
      throw new AppError(409, 'Click does not match player registration');
    }

    // Only one FTD per player, so CPA can't be paid twice.
    if (event.event_type === 'ftd' && playerHasEvent(event.player_id, 'ftd')) {
      throw new AppError(409, 'Player already has an FTD');
    }
  }

  addPlayerEvent(event);
}

export function recordDailyPlayerActivity(activity: DailyPlayerActivity): void {
  addDailyPlayerActivity(activity);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// from/to are inclusive UTC dates; timestamped rows are matched on the
// half-open range [from 00:00, day after to 00:00).
export function buildAffiliateReport(
  affiliateId: string,
  from: string,
  to: string,
): AffiliateReport {
  const affiliate = getAffiliateById(affiliateId);
  if (affiliate === null) {
    throw new AppError(404, 'Unknown affiliate');
  }

  const fromTs = new Date(`${from}T00:00:00Z`).toISOString();
  const toTs = new Date(Date.parse(`${to}T00:00:00Z`) + DAY_MS).toISOString();

  const clicks = countClicks(affiliateId, fromTs, toTs);
  const registrations = countRegistrations(affiliateId, fromTs, toTs);
  const ftds = getAttributedFtds(affiliateId, fromTs, toTs);
  const activity = getAttributedActivity(affiliateId, from, to);

  return {
    affiliateId,
    from,
    to,
    clicks,
    registrations,
    ftds: ftds.length,
    // FTDs as a percentage of clicks, to one decimal place.
    conversionRate:
      clicks === 0 ? 0 : Math.round((ftds.length / clicks) * 1000) / 10,
    commission: calculateCommission(affiliate.dealType, ftds, activity),
  };
}
