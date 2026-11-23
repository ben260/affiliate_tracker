# Affiliate Tracker

Records affiliate clicks, receives operator postbacks, calculates CPA/RevShare commission and reports per affiliate. Built with Node.js, Express and SQLite (`node:sqlite`).

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

**Replay mode** (`REPLAY=1`, set by `npm run start:replay`) lets clicks carry their original time and IP through the `X-Event-Time` and `X-Forwarded-For` headers. Postbacks already carry their own timestamps. Outside replay mode, both headers are ignored. Re-seed before replaying again.

## Tests and checks

```sh
npm test              # unit + integration tests (in-memory SQLite, never touches app.db)
npm run typecheck
npm run lint
npm run format-check
```
