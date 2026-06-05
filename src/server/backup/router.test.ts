/**
 * Backup router tests (#147).
 */
import type { Database } from "better-sqlite3";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database_ from "better-sqlite3";

import { openDb } from "../../db/index.js";
import { Metrics } from "../metrics.js";
import { createApp } from "../app.js";
import { createBackupRouter } from "./router.js";
import { createBackup, SCRYPT_N_TEST } from "../../vault/backup.js";

const TEST_SCRYPT_N = SCRYPT_N_TEST;

function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe("backup router", () => {
  let db: Database;
  let server: Server;
  let base: string;
  let tmpDir: string;
  let testDbPath: string;
  let testVaultPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "backup-router-test-"));
    testDbPath = join(tmpDir, "test.db");
    testVaultPath = join(tmpDir, "auth.json");

    // Create a test DB with a schema table (backup_log needs to exist)
    const testDb = new Database_(testDbPath);
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS backup_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        direction TEXT NOT NULL CHECK (direction IN ('export', 'import')),
        created_at TEXT NOT NULL,
        note TEXT
      );
      CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY);
    `);
    testDb.close();

    await writeFile(testVaultPath, JSON.stringify({ test: "data" }), { mode: 0o600 });

    db = openDb({ path: ":memory:" });
    // Create backup_log in the in-memory db for the router
    db.exec(`
      CREATE TABLE IF NOT EXISTS backup_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        direction TEXT NOT NULL CHECK (direction IN ('export', 'import')),
        created_at TEXT NOT NULL,
        note TEXT
      );
    `);

    const router = createBackupRouter({
      db,
      dbFilePath: testDbPath,
      vaultFilePath: testVaultPath,
      scryptN: TEST_SCRYPT_N
    });
    const app = createApp({
      metrics: new Metrics(),
      checkReadiness: () => ({ db: true, config: true, vault: true }),
      backupRouter: router
    });
    const started = await listen(app);
    server = started.server;
    base = started.base;
  });

  afterEach(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close(async (err) => {
          db.close();
          await rm(tmpDir, { recursive: true, force: true });
          err ? reject(err) : resolve();
        });
      })
  );

  it("POST /api/backup/export returns octet-stream buffer", async () => {
    const res = await fetch(`${base}/api/backup/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: "test-passphrase-strong" })
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/octet-stream");
    expect(res.headers.get("content-disposition")).toContain("openzigs-social-backup-");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(60);
  });

  it("POST /api/backup/export rejects short passphrase with 422", async () => {
    const res = await fetch(`${base}/api/backup/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: "short" })
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/passphrase/i);
  });

  it("POST /api/backup/export rejects missing passphrase with 422", async () => {
    const res = await fetch(`${base}/api/backup/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(422);
  });

  it("POST /api/backup/import accepts multipart and restores", async () => {
    // First create a bundle
    const passphrase = "roundtrip-passphrase";
    const bundle = await createBackup({
      passphrase,
      dbFilePath: testDbPath,
      vaultFilePath: testVaultPath,
      scryptN: TEST_SCRYPT_N
    });

    // Build multipart body manually
    const boundary = "test-boundary-12345";
    const body = buildMultipart(boundary, bundle, passphrase);

    const restoreDbPath = join(tmpDir, "restored.db");
    const restoreVaultPath = join(tmpDir, "restored-auth.json");

    // Re-mount the router pointing at restore paths
    const restoreDb = openDb({ path: ":memory:" });
    restoreDb.exec(`
      CREATE TABLE IF NOT EXISTS backup_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        direction TEXT NOT NULL CHECK (direction IN ('export', 'import')),
        created_at TEXT NOT NULL,
        note TEXT
      );
    `);
    const restoreRouter = createBackupRouter({
      db: restoreDb,
      dbFilePath: restoreDbPath,
      vaultFilePath: restoreVaultPath,
      scryptN: TEST_SCRYPT_N
    });
    const restoreApp = createApp({
      metrics: new Metrics(),
      checkReadiness: () => ({ db: true, config: true, vault: true }),
      backupRouter: restoreRouter
    });
    const { server: restoreServer, base: restoreBase } = await listen(restoreApp);

    try {
      const res = await fetch(`${restoreBase}/api/backup/import`, {
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body
      });

      if (res.status !== 200) {
        const errBody = await res.text();
        throw new Error(`import failed: ${errBody}`);
      }
      expect(res.status).toBe(200);
      const result = (await res.json()) as { restored: boolean; createdAt: string };
      expect(result.restored).toBe(true);
      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    } finally {
      await new Promise<void>((resolve) =>
        restoreServer.close(() => {
          restoreDb.close();
          resolve();
        })
      );
    }
  });

  it("POST /api/backup/import returns 422 on wrong passphrase", async () => {
    const bundle = await createBackup({
      passphrase: "correct-passphrase",
      dbFilePath: testDbPath,
      vaultFilePath: testVaultPath,
      scryptN: TEST_SCRYPT_N
    });

    const boundary = "test-boundary-bad";
    const body = buildMultipart(boundary, bundle, "wrong-passphrase");

    const res = await fetch(`${base}/api/backup/import`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body
    });

    expect(res.status).toBe(422);
    const result = (await res.json()) as { error: string };
    expect(result.error).toMatch(/passphrase|corrupt/i);
  });

  it("POST /api/backup/import returns 400 for non-multipart content-type", async () => {
    const res = await fetch(`${base}/api/backup/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
  });
});

/** Build a minimal multipart/form-data body Buffer for testing. */
function buildMultipart(boundary: string, fileBuffer: Buffer, passphrase: string): Buffer {
  const CRLF = "\r\n";
  const parts: Buffer[] = [];

  // File field
  parts.push(
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="file"; filename="backup.bin"${CRLF}` +
        `Content-Type: application/octet-stream${CRLF}${CRLF}`,
      "utf8"
    )
  );
  parts.push(fileBuffer);
  parts.push(Buffer.from(CRLF, "utf8"));

  // Passphrase field
  parts.push(
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="passphrase"${CRLF}${CRLF}` +
        passphrase +
        CRLF,
      "utf8"
    )
  );

  parts.push(Buffer.from(`--${boundary}--${CRLF}`, "utf8"));
  return Buffer.concat(parts);
}
