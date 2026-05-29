import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appliedVersions, loadMigrations, migrate } from "./migrator.js";

describe("migrator", () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ozs-mig-"));
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function write(name: string, sql: string): void {
    writeFileSync(join(dir, name), sql);
  }

  it("loads and sorts migrations by numeric version", () => {
    write("0002-second.sql", "CREATE TABLE b(id);");
    write("0001-first.sql", "CREATE TABLE a(id);");
    write("ignore.txt", "noop");
    const migs = loadMigrations(dir);
    expect(migs.map((m) => m.version)).toEqual([1, 2]);
    expect(migs[0]?.name).toBe("first");
  });

  it("accepts both - and _ separators", () => {
    write("0001_init.sql", "CREATE TABLE a(id);");
    expect(loadMigrations(dir)).toHaveLength(1);
  });

  it("throws on duplicate versions", () => {
    write("0001-a.sql", "SELECT 1;");
    write("0001-b.sql", "SELECT 1;");
    expect(() => loadMigrations(dir)).toThrow(/duplicate version 1/);
  });

  it("applies pending migrations in order and records them", () => {
    write("0001-first.sql", "CREATE TABLE a(id INTEGER);");
    write("0002-second.sql", "CREATE TABLE b(id INTEGER);");
    const result = migrate(db, dir);
    expect(result.applied).toEqual([1, 2]);
    expect(appliedVersions(db)).toEqual([1, 2]);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('a','b')")
      .all();
    expect(tables).toHaveLength(2);
  });

  it("is idempotent — re-running applies nothing new", () => {
    write("0001-first.sql", "CREATE TABLE a(id INTEGER);");
    migrate(db, dir);
    const second = migrate(db, dir);
    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toEqual([1]);
  });

  it("applies only the new migration when one is added later", () => {
    write("0001-first.sql", "CREATE TABLE a(id INTEGER);");
    migrate(db, dir);
    write("0002-second.sql", "CREATE TABLE b(id INTEGER);");
    const result = migrate(db, dir);
    expect(result.applied).toEqual([2]);
  });

  it("rolls back a failing migration and does not record its version", () => {
    write("0001-first.sql", "CREATE TABLE a(id INTEGER);");
    write("0002-bad.sql", "CREATE TABLE b(id INTEGER); THIS IS NOT SQL;");
    expect(() => migrate(db, dir)).toThrow();
    expect(appliedVersions(db)).toEqual([1]);
    const b = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='b'").all();
    expect(b).toHaveLength(0);
  });
});
