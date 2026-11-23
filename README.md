# Affiliate Tracker

Records affiliate clicks, receives operator postbacks, calculates CPA/RevShare commission and reports per affiliate. Built with Node.js, Express and SQLite (`node:sqlite`). TypeScript runs directly through Node's type stripping, so there's no build step.

Requires **Node.js 24+**.

## Setup and run

```sh
npm run setup   # install dependencies and create a seeded app.db
npm start       # API on http://localhost:3000
```

## Replay `events.json`

```sh
# terminal 1: fresh database, server in replay mode
npm run seed
npm run start:replay

# terminal 2
npm run replay
```

The replay sends every event in file order, swapping each `clickRef` for the `click_id` our API issued. It prints any rejected postbacks, then writes the October 2026 reports to [report.json](report.json):

| Affiliate | Clicks | Regs | FTDs | Conversion |  CPA | RevShare |   Total |
| --------- | -----: | ---: | ---: | ---------: | ---: | -------: | ------: |
| AFF-001   |    121 |   10 |    8 |       6.6% | €600 |       €0 |    €600 |
| AFF-002   |     54 |    7 |    6 |      11.1% |   €0 |  €390.25 | €390.25 |
| AFF-003   |     40 |    5 |    4 |        10% | €150 |       €0 |    €150 |

Eight postbacks are rejected on purpose (outside the 30-day window, unknown clicks, a second registration for an already-attributed player); [NOTES.md](NOTES.md) explains why.

**Replay mode** (`REPLAY=1`, set by `npm run start:replay`) lets clicks carry their original time and IP through the `X-Event-Time` and `X-Forwarded-For` headers. Postbacks already carry their own timestamps. Outside replay mode, both headers are ignored. Re-seed before replaying again.

## API

| Endpoint                               | Notes                                                            |
| -------------------------------------- | ---------------------------------------------------------------- |
| `GET /click?aff=&campaign=&sub=`       | `302` to the campaign page with `click_id`                       |
| `POST /postback`                       | `registration`, `ftd`, `deposit` and `activity`, as in the brief |
| `GET /affiliates/:id/report?from=&to=` | Inclusive UTC dates; commission in EUR                           |

Errors: `400` invalid input, `404` unknown affiliate/campaign/click, `409` conflicts with the player's existing attribution, `422` registration outside the 30-day window. A resent `transactionId` is accepted and ignored.

## Tests and checks

```sh
npm test              # unit + integration tests (in-memory SQLite, never touches app.db)
npm run typecheck
npm run lint
npm run format-check
```

CI runs all four on pushes and pull requests to `main`.

## Layout

`src/app.ts` routes → `validation.ts` input parsing → `services.ts` business rules → `repository.ts` SQL. Commission maths and deal terms are in `commission.ts`. `scripts/seed.ts` creates the schema and seed data; `scripts/replay.ts` replays `events.json`.
