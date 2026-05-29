import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";

import { createApp, type ReadinessReport } from "./app.js";
import { Metrics } from "./metrics.js";
import { CredentialVault } from "../vault/index.js";

function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe("createApp", () => {
  let server: Server;
  let base: string;
  let ready: ReadinessReport;
  let metrics: Metrics;

  beforeEach(async () => {
    ready = { db: true, config: true, vault: true };
    metrics = new Metrics();
    const app = createApp({ metrics, checkReadiness: () => ready });
    ({ server, base } = await listen(app));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /health returns 200 with uptime", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; uptimeMs: number };
    expect(body.status).toBe("ok");
    expect(body.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it("GET /ready returns 200 when all checks pass", async () => {
    const res = await fetch(`${base}/ready`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ready");
  });

  it("GET /ready returns 503 when a check fails", async () => {
    ready = { db: false, config: true, vault: true };
    const res = await fetch(`${base}/ready`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; checks: ReadinessReport };
    expect(body.status).toBe("not_ready");
    expect(body.checks.db).toBe(false);
  });

  it("GET /api/metrics returns the snapshot envelope", async () => {
    metrics.recordSent("twitter");
    const res = await fetch(`${base}/api/metrics`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { timestamp: string; metrics: Record<string, unknown> };
    expect(body.metrics.twitter).toEqual({ sent: 1, received: 0, failed: 0 });
    expect(typeof body.timestamp).toBe("string");
  });

  it("does not leak x-powered-by", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.headers.get("x-powered-by")).toBeNull();
  });
});

describe("createApp setup-wizard wiring", () => {
  let server: Server;
  let base: string;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("does not mount /api/setup when no vault is provided", async () => {
    const app = createApp({
      metrics: new Metrics(),
      checkReadiness: () => ({ db: true, config: true, vault: true })
    });
    ({ server, base } = await listen(app));
    const res = await fetch(`${base}/api/setup/status`);
    expect(res.status).toBe(404);
  });

  it("mounts /api/setup/status when a vault is provided", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ozs-app-setup-"));
    const vault = new CredentialVault({ filePath: join(dir, "auth.json"), keyMaterial: "k" });
    const app = createApp({
      metrics: new Metrics(),
      checkReadiness: () => ({ db: true, config: true, vault: true }),
      vault
    });
    ({ server, base } = await listen(app));
    const res = await fetch(`${base}/api/setup/status`);
    expect(res.status).toBe(200);
    expect((await res.json()).complete).toBe(false);
  });
});

describe("createApp CORS", () => {
  const UI_ORIGIN = "http://localhost:3001";
  let server: Server;
  let base: string;
  let dir: string;

  function makeVault() {
    dir = mkdtempSync(join(tmpdir(), "ozs-app-cors-"));
    return new CredentialVault({ filePath: join(dir, "auth.json"), keyMaterial: "k" });
  }

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("echoes the configured origin on an OPTIONS preflight", async () => {
    const app = createApp({
      metrics: new Metrics(),
      checkReadiness: () => ({ db: true, config: true, vault: true }),
      vault: makeVault(),
      uiOrigin: UI_ORIGIN
    });
    ({ server, base } = await listen(app));
    const res = await fetch(`${base}/api/setup/validate-key`, {
      method: "OPTIONS",
      headers: {
        Origin: UI_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"
      }
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(UI_ORIGIN);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
      "content-type"
    );
    expect(res.headers.get("vary")).toContain("Origin");
  });

  it("echoes the configured origin on an actual POST /api/setup/validate-key", async () => {
    const app = createApp({
      metrics: new Metrics(),
      checkReadiness: () => ({ db: true, config: true, vault: true }),
      vault: makeVault(),
      uiOrigin: UI_ORIGIN
    });
    ({ server, base } = await listen(app));
    const res = await fetch(`${base}/api/setup/validate-key`, {
      method: "POST",
      headers: { Origin: UI_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ provider: "openai", apiKey: "" })
    });
    // Body is intentionally invalid (empty apiKey) so we don't hit the network;
    // the point is the ACAO header is present on the real (non-preflight) response.
    expect(res.headers.get("access-control-allow-origin")).toBe(UI_ORIGIN);
    expect(res.headers.get("vary")).toContain("Origin");
  });

  it("does not echo a disallowed origin (no wildcard, no reflection)", async () => {
    const app = createApp({
      metrics: new Metrics(),
      checkReadiness: () => ({ db: true, config: true, vault: true }),
      vault: makeVault(),
      uiOrigin: UI_ORIGIN
    });
    ({ server, base } = await listen(app));
    const res = await fetch(`${base}/api/setup/validate-key`, {
      method: "OPTIONS",
      headers: { Origin: "http://evil.example", "Access-Control-Request-Method": "POST" }
    });
    const acao = res.headers.get("access-control-allow-origin");
    expect(acao).not.toBe("http://evil.example");
    expect(acao).not.toBe("*");
    expect(acao).toBeNull();
  });
});
