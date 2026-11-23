# Notes

## Assumptions

### Attribution

- **First registration wins.** A player belongs to the affiliate whose click their first accepted registration came through. Later registrations, and FTDs or deposits on another click, get a 409 (P-1021 via `c-0217`).
- **FTDs can arrive before their registration** (P-1007, P-1024), so they're accepted without one. Reports only count them once the player has an accepted registration on the same click; otherwise P-1011, whose registration was outside the window, would still earn CPA.
- The 30-day window runs from click to registration, inclusive.
- A resent `transactionId` (`T-10004`, `T-10012`) is stored once and still gets a 200, so the operator stops retrying. This assumes a single operator, since transaction IDs are only unique per operator.
- One FTD per player. Activity is stored even before the registration arrives; a resent day replaces the earlier one.
- Every click counts (no bot filtering). `/click` ignores any `url=` parameter, so it can't be used as an open redirect.

### Commission and reports

- The database stores only each affiliate's deal type. What each type pays lives in `DEAL_TERMS` in [src/commission.ts](src/commission.ts), so changing a deal needs a deploy.
- An FTD qualifies at €20 or more after converting GBP at 1.15 (£18 = €20.70 qualifies; £17 = €19.55 doesn't).
- RevShare is on **monthly** NGR: each calendar month in a report's range is netted on its own, and **a losing month pays €0**, with no carry-over. This is why AFF-003 (October NGR −€1,250) earns CPA only.
- `ftds` counts all attributed FTDs, qualifying or not. Money is rounded to cents only on the final totals.
- Everything is in UTC. Events count in the period of their own timestamp, and activity `date`s are treated as UTC days. Timestamps without a timezone are rejected, because otherwise they'd be read in the server's local time.
- `deposit` events are stored but unused, since no deal depends on them.

### Testing

Unit tests cover the commission maths and validation. Attribution and reports are tested against a real in-memory SQLite database rather than a mocked repository, because the rules live in the SQL joins: a mock would have hidden the P-1011 bug. I'd mock only external services. With Postgres in production, I'd test against a real Postgres in a container.

## Questions for the product owner

1. **Negative NGR:** carry it forward, claw it back, or reset to zero (current)? This alone changes AFF-003's payout.
2. **Competing registrations:** first registration (current), last click, or manual review?
3. **Attribution window:** 30 × 24 hours or calendar days? Does it also limit when an FTD counts?
4. **Timezones:** which timezone are operators' activity `date`s in? Should reports use UTC?
5. **Qualifying FTD:** is €20 inclusive? First deposit only, or total deposits over a period?
6. **Report periods:** can late postbacks change a month that's already been paid?
7. **Currency:** is 1.15 fixed, or should past months use the rate at the time?
8. **RevShare lifetime:** indefinite, or a fixed period after registration?
9. **Operators:** how do we know which operator sent a postback? This decides authentication and how transaction IDs stay unique.
10. **Fraud:** should bot or repeat-IP clicks be excluded?

## With more time

- **Deal terms in the database**, with effective-from dates, so deals can be set per affiliate without a release.
- **Postback security:** per-operator HMAC signatures, keyed on `(operator_id, transaction_id)`.
- **HTTP-level and end-to-end tests:** split `app.listen` out of `app.ts`, and run the replay in CI.
- **Versioned migrations**, integer cents, a log of rejected postbacks, and locked monthly statements.

### Production readiness

Production needs much more than the features:

- **Packaging:** Docker, config from environment variables, and a staging environment fed by operator sandboxes. Replay mode is never enabled in production.
- **Scaling:** Postgres, since SQLite has a single writer, so load-balanced instances can share one database. Redis caching and batched writes on the hot `/click` path, and queued postbacks.
- **Security:** a reverse proxy (HTTPS, rate limiting, correct `trust proxy`; behind one, clicks currently record the proxy's IP), auth on reports (currently public), and a secrets manager.
- **Observability:** structured logs, Prometheus/Grafana or Datadog metrics (click latency, rejections by reason, commission per affiliate), and Sentry.
- **On-call:** PagerDuty for `/click` failures, because a lost click can never be attributed. Backups with point-in-time recovery.
