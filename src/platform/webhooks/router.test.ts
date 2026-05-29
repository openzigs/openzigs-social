import { type Server } from "node:http";
import { type AddressInfo } from "node:net";

import type { Database } from "better-sqlite3";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import { WebhookEventStore } from "./event-store.js";
import { WebhookHandlerRegistry, type WebhookEvent } from "./handler-registry.js";
import { computeSignature } from "./hmac.js";
import { createWebhookRouter } from "./router.js";
import { verifySignature } from "./hmac.js";

const SECRET = "webhook-secret";

function listen(app: Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe("webhook router", () => {
  let server: Server | undefined;
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    server?.close();
    server = undefined;
    db.close();
  });

  async function mount(deps: Parameters<typeof createWebhookRouter>[0]): Promise<string> {
    const app = express();
    app.use("/webhooks", createWebhookRouter(deps));
    const r = await listen(app);
    server = r.server;
    return r.base;
  }

  function registryWith(handle: (e: WebhookEvent) => void): WebhookHandlerRegistry {
    const registry = new WebhookHandlerRegistry();
    registry.register({
      platform: "instagram",
      verify: (raw, headers) => verifySignature(raw, headers["x-hub-signature-256"], SECRET),
      extractEventId: (payload) => (payload as { id?: string }).id,
      handle
    });
    return registry;
  }

  async function post(
    base: string,
    platform: string,
    body: string,
    sign = true
  ): Promise<Response> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (sign) headers["x-hub-signature-256"] = `sha256=${computeSignature(body, SECRET)}`;
    return fetch(`${base}/webhooks/${platform}`, { method: "POST", headers, body });
  }

  it("accepts a correctly-signed event and dispatches to the handler", async () => {
    const received: WebhookEvent[] = [];
    const registry = registryWith((e) => received.push(e));
    const base = await mount({ registry, eventStore: new WebhookEventStore(db) });

    const body = JSON.stringify({ id: "evt-1", text: "hi" });
    const res = await post(base, "instagram", body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(received).toHaveLength(1);
    expect(received[0]?.eventId).toBe("evt-1");
    expect(received[0]?.payload).toEqual({ id: "evt-1", text: "hi" });
  });

  it("returns 404 for an unknown platform", async () => {
    const base = await mount({
      registry: registryWith(() => {}),
      eventStore: new WebhookEventStore(db)
    });
    const res = await post(base, "tiktok", JSON.stringify({ id: "x" }));
    expect(res.status).toBe(404);
  });

  it("returns 401 for a missing or invalid signature without echoing the body", async () => {
    const handle = vi.fn();
    const base = await mount({
      registry: registryWith(handle),
      eventStore: new WebhookEventStore(db)
    });
    const body = JSON.stringify({ id: "evt-1", secret: "leak-me" });

    const missing = await post(base, "instagram", body, false);
    expect(missing.status).toBe(401);
    const text = await missing.text();
    expect(text).not.toContain("leak-me");

    const tampered = await fetch(`${base}/webhooks/instagram`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=deadbeef" },
      body
    });
    expect(tampered.status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
  });

  it("de-duplicates redelivered events", async () => {
    const handle = vi.fn();
    const base = await mount({
      registry: registryWith(handle),
      eventStore: new WebhookEventStore(db)
    });
    const body = JSON.stringify({ id: "evt-dup" });
    const first = await post(base, "instagram", body);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    const second = await post(base, "instagram", body);
    expect(await second.json()).toEqual({ ok: true, duplicate: true });
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for a malformed JSON payload", async () => {
    const base = await mount({
      registry: registryWith(() => {}),
      eventStore: new WebhookEventStore(db)
    });
    const body = "{not json";
    const res = await fetch(`${base}/webhooks/instagram`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${computeSignature(body, SECRET)}`
      },
      body
    });
    expect(res.status).toBe(400);
  });

  it("returns 500 when the handler throws (no internals leaked)", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const registry = registryWith(() => {
      throw new Error("boom internal");
    });
    const base = await mount({ registry, eventStore: new WebhookEventStore(db), logger });
    const body = JSON.stringify({ id: "evt-err" });
    const res = await post(base, "instagram", body);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("boom internal");
    expect(logger.error).toHaveBeenCalled();
  });
});
