import { db } from '../src/db.ts';

db.exec(`
  CREATE TABLE affiliates (
    id        TEXT PRIMARY KEY,
    deal_type TEXT NOT NULL CHECK (deal_type IN ('cpa', 'rev_share', 'hybrid'))
  );

  CREATE TABLE campaigns (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url  TEXT NOT NULL
  );

  CREATE TABLE clicks (
    click_id     TEXT PRIMARY KEY,
    affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
    campaign_id  TEXT NOT NULL REFERENCES campaigns(id),
    sub_id       TEXT NOT NULL,
    ip           TEXT NOT NULL,
    user_agent   TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );

  CREATE TABLE player_events (
    transaction_id TEXT PRIMARY KEY,
    click_id       TEXT NOT NULL REFERENCES clicks(click_id),
    event_type     TEXT NOT NULL CHECK (event_type IN ('registration', 'ftd', 'deposit')),
    player_id      TEXT NOT NULL,
    amount         REAL,
    currency       TEXT CHECK (currency IN ('EUR', 'GBP')),
    created_at     TEXT NOT NULL
  );

  CREATE TABLE daily_player_activity (
    player_id TEXT NOT NULL,
    date      TEXT NOT NULL,
    bets      REAL NOT NULL,
    wins      REAL NOT NULL,
    bonuses   REAL NOT NULL,
    currency  TEXT NOT NULL CHECK (currency IN ('EUR', 'GBP')),
    PRIMARY KEY (player_id, date)
  );

  INSERT INTO affiliates (id, deal_type) VALUES
    ('AFF-001', 'cpa'),
    ('AFF-002', 'rev_share'),
    ('AFF-003', 'hybrid');

  INSERT INTO campaigns (id, name, url) VALUES
    ('CMP-101', 'Brand Alpha',   'https://alpha-x7k2q.example/welcome'),
    ('CMP-102', 'Brand Bravo',   'https://bravo-p93ld.example/join'),
    ('CMP-103', 'Brand Charlie', 'https://charlie-m4t8z.example/start');
`);

console.log('Database seeded');
