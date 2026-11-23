import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

// DB_PATH lets tests use ':memory:'; everything else uses app.db.
export const db = new DatabaseSync(
  process.env.DB_PATH ?? fileURLToPath(new URL('../app.db', import.meta.url)),
);

db.exec('PRAGMA foreign_keys = ON');
