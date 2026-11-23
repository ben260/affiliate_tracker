# Notes

## Assumptions

### Attribution

- **First registration wins.** Later registrations, and FTDs on another click, get a 409 (P-1021 via `c-0217`).
- **FTDs can arrive before their registration** (P-1007, P-1024), so they're accepted, but reports only count them once the player has an accepted registration on the same click. Otherwise P-1011, which registered outside the window, would earn CPA.
- The 30-day window runs from click to registration, inclusive.
- A resent `transactionId` is stored once and still returns 200. This assumes a single operator.
- One FTD per player. A resent activity day replaces the earlier one.
- Every click counts (no bot filtering). `/click` ignores any `url=` parameter, so it can't be used as an open redirect.

### Commission and reports

- The database stores only each affiliate's deal type. The terms for each type live in `DEAL_TERMS` in [src/commission.ts](src/commission.ts).
- An FTD qualifies at €20 or more after converting GBP at 1.15.
- RevShare uses **monthly** NGR, and a losing month pays €0, with no carry-over. That is why AFF-003 earns CPA only.
- `ftds` counts every attributed FTD, qualifying or not. Only the final totals are rounded.
- Everything is UTC. Timestamps without a timezone are rejected. `deposit` events are stored but unused.

### Testing

Commission maths and validation are unit tested. Attribution and reports are tested against a real in-memory SQLite database, not a mocked repository, because the rules live in SQL joins; a mock would have hidden the P-1011 bug.

## Questions for the product owner

1. **Negative NGR:** carry forward, claw back, or reset to zero (current)? This changes AFF-003's payout.
2. **Competing registrations:** first registration (current), last click, or manual review?
3. **Window:** 30 × 24 hours or calendar days? Does it also limit FTDs?
4. **Timezones:** what timezone are operators' activity dates in?
5. **Qualifying FTD:** is €20 inclusive? First deposit only?
6. **Late postbacks:** can they change a month that's already paid?
7. **Currency:** fixed 1.15, or the historical rate?
8. **Operators:** how do we identify and authenticate them?
9. **Fraud:** should bot or repeat-IP clicks be excluded?

## With more time

- Deal terms in the database with effective dates, so they can change without a deploy.
- HMAC-signed postbacks keyed on `(operator_id, transaction_id)`.
- HTTP and end-to-end tests, with the replay run in CI.
- Migrations, integer cents, a log of rejected postbacks, and locked monthly statements.

**Production:** Docker and a staging environment. Postgres behind load-balanced instances, with Redis and queueing on the hot paths. A reverse proxy for HTTPS and rate limiting, and auth on reports. Metrics (Prometheus/Grafana or Datadog), Sentry, and PagerDuty for `/click` failures, since a lost click can never be attributed. Backups.
