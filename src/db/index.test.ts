import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { closeDb, getDb, openDb } from "./index.js";
import { DATA_DIR_ENV } from "../config/paths.js";

describe("db bootstrap", () => {
  let dir: string;
  const originalHome = process.env[DATA_DIR_ENV];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ozs-db-"));
  });

  afterEach(() => {
    closeDb();
    if (originalHome === undefined) delete process.env[DATA_DIR_ENV];
    else process.env[DATA_DIR_ENV] = originalHome;
    rmSync(dir, { recursive: true, force: true });
  });

  it("opens with WAL + foreign_keys pragmas and runs migrations", () => {
    const db = openDb({ path: join(dir, "test.db") });
    expect(String(db.pragma("journal_mode", { simple: true })).toLowerCase()).toBe("wal");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    const meta = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'")
      .get();
    expect(meta).toBeDefined();
    const migs = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
    expect(migs).toContainEqual({ version: 1 });
    db.close();
  });

  it("can skip migrations", () => {
    const db = openDb({ path: ":memory:", skipMigrations: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(tables).toHaveLength(0);
    db.close();
  });

  it("getDb returns a singleton honouring OPENZIGS_SOCIAL_HOME", () => {
    process.env[DATA_DIR_ENV] = dir;
    const a = getDb();
    const b = getDb();
    expect(a).toBe(b);
    a.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run("k", "v");
    const row = a.prepare("SELECT value FROM meta WHERE key = ?").get("k") as { value: string };
    expect(row.value).toBe("v");
  });

  it("closeDb allows reopening", () => {
    process.env[DATA_DIR_ENV] = dir;
    const a = getDb();
    closeDb();
    const b = getDb();
    expect(a).not.toBe(b);
  });
});
