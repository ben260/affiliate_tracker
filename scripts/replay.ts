import { readFileSync, writeFileSync } from 'node:fs';
import type { AffiliateReport } from '../src/types.ts';

const BASE_URL = 'http://localhost:3000';
const AFFILIATES = ['AFF-001', 'AFF-002', 'AFF-003'];
const REPORT_FROM = '2026-10-01';
const REPORT_TO = '2026-10-31';

type ClickEvent = {
  type: 'click';
  ref: string;
  aff: string;
  campaign: string;
  sub: string;
  ip: string;
  userAgent: string;
  timestamp: string;
};

type PostbackEvent = {
  type: 'postback';
  event: string;
  clickRef?: string; // absent on activity events
  playerId: string;
  transactionId?: string; // absent on activity events
  date?: string; // activity events only
  [field: string]: unknown;
};

type Event = ClickEvent | PostbackEvent;

const events = JSON.parse(
  readFileSync(new URL('../events.json', import.meta.url), 'utf8'),
) as Event[];

// ref from events.json -> click_id issued by our API
const clickIds = new Map<string, string>();

async function sendClick(event: ClickEvent): Promise<number> {
  const params = new URLSearchParams({
    aff: event.aff,
    campaign: event.campaign,
    sub: event.sub,
  });

  const res = await fetch(`${BASE_URL}/click?${params}`, {
    redirect: 'manual', // don't follow the redirect to the casino
    headers: {
      'User-Agent': event.userAgent,
      'X-Forwarded-For': event.ip,
      'X-Event-Time': event.timestamp,
    },
  });

  const location = res.headers.get('location');
  const clickId = location
    ? new URL(location).searchParams.get('click_id')
    : null;

  if (clickId) {
    clickIds.set(event.ref, clickId);
  } else {
    console.log(`click ${event.ref} -> ${res.status} ${await res.text()}`);
  }
  return res.status;
}

async function sendPostback(event: PostbackEvent): Promise<number> {
  const { type, clickRef, ...body } = event;

  if (clickRef !== undefined) {
    // A ref we never issued an id for is sent as-is, so the API rejects it
    // the same way it would reject an operator's bad click_id.
    body.clickId = clickIds.get(clickRef) ?? clickRef;
  }

  const res = await fetch(`${BASE_URL}/postback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const id = event.transactionId ?? `${event.playerId} ${event.date ?? ''}`;
    console.log(
      `postback ${event.event} ${id} (${clickRef ?? 'no click'}) -> ` +
        `${res.status} ${await res.text()}`,
    );
  }
  return res.status;
}

// Sent one at a time in file order: a registration must be stored before the
// FTDs and deposits that depend on it, and the attribution checks depend on
// which registration arrives first.
const statuses: Record<string, number> = {};
for (const event of events) {
  const status =
    event.type === 'click' ? await sendClick(event) : await sendPostback(event);
  const key = `${event.type} ${status}`;
  statuses[key] = (statuses[key] ?? 0) + 1;
}

console.log('\nReplay finished:', statuses);

const reports: AffiliateReport[] = [];
for (const affiliateId of AFFILIATES) {
  const params = new URLSearchParams({ from: REPORT_FROM, to: REPORT_TO });
  const res = await fetch(
    `${BASE_URL}/affiliates/${affiliateId}/report?${params}`,
  );
  if (!res.ok) {
    throw new Error(
      `Report for ${affiliateId} failed: ${res.status} ${await res.text()}`,
    );
  }
  reports.push((await res.json()) as AffiliateReport);
}

const reportPath = new URL('../report.json', import.meta.url);
writeFileSync(reportPath, JSON.stringify(reports, null, 2) + '\n');
console.log(`\nWrote ${reports.length} reports to report.json`);
console.table(
  reports.map((r) => ({
    affiliate: r.affiliateId,
    clicks: r.clicks,
    registrations: r.registrations,
    ftds: r.ftds,
    conversionRate: r.conversionRate,
    cpa: r.commission.cpa,
    revShare: r.commission.revShare,
    total: r.commission.total,
  })),
);
