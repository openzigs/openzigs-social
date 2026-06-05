/**
 * Unit tests for backup.ts / restore.ts roundtrip.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import { createBackup } from "./backup.js";
import { restoreBackup, RestoreError } from "./restore.js";

/** Low-N scrypt for tests so they don't hit the memory limit. */
const TEST_SCRYPT_N = 1024;

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "backup-test-"));
}

async function createTestDb(dbPath: string) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE test_data (id INTEGER PRIMARY KEY, value TEXT);
    INSERT INTO test_data VALUES (1, 'hello'), (2, 'world');
  `);
  db.close();
}

describe("backup roundtrip", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("exports and restores the database content", async () => {
    const dbPath = join(tmpDir, "test.db");
    const vaultPath = join(tmpDir, "auth.json");

    await createTestDb(dbPath);
    await writeFile(vaultPath, JSON.stringify({ test: "vault-content" }), { mode: 0o600 });

    const passphrase = "correct-horse-battery-staple";
    const bundle = await createBackup({ passphrase, dbFilePath: dbPath, vaultFilePath: vaultPath, scryptN: TEST_SCRYPT_N });

    expect(bundle).toBeInstanceOf(Buffer);
    expect(bundle.length).toBeGreaterThan(60); // salt + iv + tag + ciphertext

    // Restore to a different directory
    const restoreDir = join(tmpDir, "restore");
    const restoredDbPath = join(restoreDir, "restored.db");
    const restoredVaultPath = join(restoreDir, "auth.json");

    const result = await restoreBackup(bundle, passphrase, {
      dbFilePath: restoredDbPath,
      vaultFilePath: restoredVaultPath,
      scryptN: TEST_SCRYPT_N
    });

    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Verify DB content
    const restoredDb = new Database(restoredDbPath, { readonly: true });
    const rows = restoredDb.prepare("SELECT * FROM test_data ORDER BY id").all();
    restoredDb.close();
    expect(rows).toEqual([
      { id: 1, value: "hello" },
      { id: 2, value: "world" }
    ]);

    // Verify vault content
    const restoredVault = await readFile(restoredVaultPath, "utf8");
    expect(JSON.parse(restoredVault)).toEqual({ test: "vault-content" });
  });

  it("throws RestoreError with wrong passphrase", async () => {
    const dbPath = join(tmpDir, "test.db");
    const vaultPath = join(tmpDir, "auth.json");

    await createTestDb(dbPath);
    await writeFile(vaultPath, "{}", { mode: 0o600 });

    const bundle = await createBackup({
      passphrase: "correct-passphrase",
      dbFilePath: dbPath,
      vaultFilePath: vaultPath,
      scryptN: TEST_SCRYPT_N
    });

    await expect(
      restoreBackup(bundle, "wrong-passphrase", {
        dbFilePath: join(tmpDir, "r.db"),
        vaultFilePath: join(tmpDir, "r.json"),
        scryptN: TEST_SCRYPT_N
      })
    ).rejects.toThrow(RestoreError);

    await expect(
      restoreBackup(bundle, "wrong-passphrase", {
        dbFilePath: join(tmpDir, "r2.db"),
        vaultFilePath: join(tmpDir, "r2.json"),
        scryptN: TEST_SCRYPT_N
      })
    ).rejects.toMatchObject({ code: "wrong_passphrase" });
  });

  it("throws RestoreError on corrupt bundle", async () => {
    const corrupt = Buffer.from("this-is-not-a-valid-bundle");

    await expect(
      restoreBackup(corrupt, "anypassphrase", {
        dbFilePath: join(tmpDir, "r.db"),
        vaultFilePath: join(tmpDir, "r.json"),
        scryptN: TEST_SCRYPT_N
      })
    ).rejects.toThrow(RestoreError);

    await expect(
      restoreBackup(corrupt, "anypassphrase", {
        dbFilePath: join(tmpDir, "r2.db"),
        vaultFilePath: join(tmpDir, "r2.json"),
        scryptN: TEST_SCRYPT_N
      })
    ).rejects.toMatchObject({ code: expect.stringMatching(/wrong_passphrase|corrupt_bundle/) });
  });

  it("throws RestoreError on empty buffer", async () => {
    await expect(
      restoreBackup(Buffer.alloc(0), "anypassphrase", {
        dbFilePath: join(tmpDir, "r.db"),
        vaultFilePath: join(tmpDir, "r.json"),
        scryptN: TEST_SCRYPT_N
      })
    ).rejects.toThrow(RestoreError);
  });

  it("throws RestoreError on truncated buffer", async () => {
    const truncated = Buffer.alloc(10); // too short for salt+iv+tag

    await expect(
      restoreBackup(truncated, "anypassphrase", {
        dbFilePath: join(tmpDir, "r.db"),
        vaultFilePath: join(tmpDir, "r.json"),
        scryptN: TEST_SCRYPT_N
      })
    ).rejects.toThrow(RestoreError);
  });

  it("handles missing vault gracefully on export", async () => {
    const dbPath = join(tmpDir, "empty.db");
    const vaultPath = join(tmpDir, "nonexistent-auth.json");

    await createTestDb(dbPath);

    const bundle = await createBackup({
      passphrase: "test-passphrase-ok",
      dbFilePath: dbPath,
      vaultFilePath: vaultPath,
      scryptN: TEST_SCRYPT_N
    });

    expect(bundle.length).toBeGreaterThan(60);
  });

  it("export throws on passphrase shorter than 8 chars", async () => {
    const dbPath = join(tmpDir, "test.db");
    await createTestDb(dbPath);

    await expect(
      createBackup({
        passphrase: "short",
        dbFilePath: dbPath,
        vaultFilePath: join(tmpDir, "auth.json")
      })
    ).rejects.toThrow(/passphrase/);
  });
});
