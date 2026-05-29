/**
 * Numbered SQL migration runner.
 *
 * Migrations live in `migrations/NNNN-description.sql` (also accepts
 * `NNNN_description.sql`). On boot, unapplied migrations are run in ascending
 * numeric order; each runs inside its own transaction and is recorded in the
 * `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT)` table.
 *
 * If a migration throws, its transaction rolls back, the version is NOT
 * recorded, and the error propagates — so a restart retries it cleanly.
 *
 * There is no ad-hoc `ALTER TABLE` anywhere: schema changes are new numbered
 * files only.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Database } from "better-sqlite3";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Default migrations directory (repo root `migrations/`). */
export function defaultMigrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "migrations");
}

const FILENAME_RE = /^(\d+)[-_](.+)\.sql$/i;

/** Load + sort migrations from a directory. Throws on duplicate versions. */
export function loadMigrations(dir: string): Migration[] {
  const seen = new Map<number, string>();
  const migrations: Migration[] = [];
  for (const file of readdirSync(dir)) {
    const match = FILENAME_RE.exec(file);
    if (!match) continue;
    const version = Number.parseInt(match[1] as string, 10);
    if (seen.has(version)) {
      throw new Error(
        `migrations: duplicate version ${version} (${seen.get(version)} and ${file})`
      );
    }
    seen.set(version, file);
    migrations.push({
      version,
      name: match[2] as string,
      sql: readFileSync(join(dir, file), "utf8")
    });
  }
  return migrations.sort((a, b) => a.version - b.version);
}

function ensureMigrationsTable(db: Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       applied_at TEXT NOT NULL
     );`
  );
}

/** Versions already applied, ascending. */
export function appliedVersions(db: Database): number[] {
  ensureMigrationsTable(db);
  const rows = db
    .prepare("SELECT version FROM schema_migrations ORDER BY version ASC")
    .all() as Array<{ version: number }>;
  return rows.map((r) => r.version);
}

export interface MigrateResult {
  applied: number[];
  alreadyApplied: number[];
}

/**
 * Apply all pending migrations from `dir` (default: {@link defaultMigrationsDir}).
 * Each migration + its bookkeeping insert run in a single transaction.
 */
export function migrate(db: Database, dir: string = defaultMigrationsDir()): MigrateResult {
  ensureMigrationsTable(db);
  const done = new Set(appliedVersions(db));
  const migrations = loadMigrations(dir);
  const applied: number[] = [];

  for (const m of migrations) {
    if (done.has(m.version)) continue;
    const run = db.transaction(() => {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        m.version,
        new Date().toISOString()
      );
    });
    run();
    applied.push(m.version);
  }

  return { applied, alreadyApplied: [...done].sort((a, b) => a - b) };
}
