# Affiliate Tracker

Requires Node.js 24+.

## Setup and run

```sh
npm run setup   # install dependencies and seed app.db
npm start       # http://localhost:3000
```

## Replay events.json

```sh
npm run seed && npm run start:replay   # terminal 1: fresh database, replay mode
npm run replay                         # terminal 2: writes report.json
```

Replay mode lets clicks keep their original time and IP through the `X-Event-Time` and `X-Forwarded-For` headers.

## Tests

```sh
npm test
```

Assumptions and open questions are in [NOTES.md](NOTES.md).
