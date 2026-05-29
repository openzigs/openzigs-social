import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildReadinessCheck, startServer, type StartedServer } from "./index.js";
import { resetConfig } from "../config/index.js";
import { DATA_DIR_ENV } from "../config/paths.js";
import { openDb } from "../db/index.js";

describe("buildReadinessCheck", () => {
  it("reports db.open state", () => {
    const db = openDb({ path: ":memory:", skipMigrations: true });
    const check = buildReadinessCheck(db);
    expect(check().db).toBe(true);
    db.close();
    expect(check().db).toBe(false);
  });
});

describe("startServer", () => {
  let dir: string;
  let server: StartedServer | undefined;
  const originalHome = process.env[DATA_DIR_ENV];
  const originalPort = process.env.OPENZIGS_SOCIAL_SERVER_PORT;
  const originalToFile = process.env.OPENZIGS_SOCIAL_LOG_TO_FILE;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ozs-boot-"));
    process.env[DATA_DIR_ENV] = dir;
    process.env.OPENZIGS_SOCIAL_SERVER_PORT = "0";
    process.env.OPENZIGS_SOCIAL_LOG_TO_FILE = "false";
    resetConfig();
  });

  afterEach(async () => {
    if (server) await server.close();
    server = undefined;
    if (originalHome === undefined) delete process.env[DATA_DIR_ENV];
    else process.env[DATA_DIR_ENV] = originalHome;
    if (originalPort === undefined) delete process.env.OPENZIGS_SOCIAL_SERVER_PORT;
    else process.env.OPENZIGS_SOCIAL_SERVER_PORT = originalPort;
    if (originalToFile === undefined) delete process.env.OPENZIGS_SOCIAL_LOG_TO_FILE;
    else process.env.OPENZIGS_SOCIAL_LOG_TO_FILE = originalToFile;
    resetConfig();
    rmSync(dir, { recursive: true, force: true });
  });

  it("boots, serves /health and /ready, then shuts down cleanly", async () => {
    server = await startServer();
    expect(server.port).toBeGreaterThan(0);

    const base = `http://127.0.0.1:${server.port}`;
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);

    const ready = await fetch(`${base}/ready`);
    expect(ready.status).toBe(200);
    const readyBody = (await ready.json()) as { status: string };
    expect(readyBody.status).toBe("ready");

    await server.close();
    server = undefined;
    expect(true).toBe(true);
  });
});
