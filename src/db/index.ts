/**
 * SQLite bootstrap (better-sqlite3).
 *
 * - Opens the DB at `<dataDir>/openzigs-social.db`.
 * - Pragmas: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.
 * - Runs pending numbered migrations via the #133 runner — never ad-hoc
 *   `ALTER TABLE`.
 * - `getDb()` returns a process-wide singleton.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { dbPath } from "../config/paths.js";
import { migrate } from "./migrator.js";

const BUSY_TIMEOUT_MS = 5000;

export interface OpenDbOptions {
  /** Override the DB file path (tests). Use ":memory:" for an ephemeral DB. */
  path?: string;
  /** Skip running migrations on open (tests). */
  skipMigrations?: boolean;
  /** Override the migrations directory (tests). */
  migrationsDir?: string;
}

/** Open a configured SQLite connection (not the singleton). */
export function openDb(opts: OpenDbOptions = {}): Database.Database {
  const file = opts.path ?? dbPath();
  if (file !== ":memory:") {
    mkdirSync(dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  if (!opts.skipMigrations) {
    migrate(db, opts.migrationsDir);
  }
  return db;
}

let singleton: Database.Database | null = null;

/** Process-wide DB singleton. Opens + migrates on first call. */
export function getDb(): Database.Database {
  if (singleton === null) {
    singleton = openDb();
  }
  return singleton;
}

/** Close + clear the singleton (graceful shutdown / tests). */
export function closeDb(): void {
  if (singleton !== null) {
    singleton.close();
    singleton = null;
  }
}
