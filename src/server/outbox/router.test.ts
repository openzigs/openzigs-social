import type { Database } from "better-sqlite3";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../../db/index.js";
import { Metrics } from "../metrics.js";
import { createApp } from "../app.js";
import { DlqRepository } from "../../platform/retry/dlq.js";
import { OutboxRepository } from "../../outbox/repository.js";
import { createOutboxRouter } from "./router.js";

function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe("outbox router", () => {
  let db: Database;
  let repo: OutboxRepository;
  let dlq: DlqRepository;
  let server: Server;
  let base: string;
  let emitted: Array<{ event: string; payload: unknown }>;

  beforeEach(async () => {
    db = openDb({ path: ":memory:" });
    repo = new OutboxRepository(db);
    dlq = new DlqRepository(db);
    emitted = [];
    const outboxRouter = createOutboxRouter({
      db,
      dlq,
      emit: (event, payload) => emitted.push({ event, payload })
    });
    const app = createApp({
      metrics: new Metrics(),
      checkReadiness: () => ({ db: true, config: true, vault: true }),
      outboxRouter
    });
    ({ server, base } = await listen(app));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  it("POST / creates a draft and rate-limits", async () => {
    const res = await fetch(`${base}/api/outbox`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "twitter", body: "hello" })
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("ratelimit-limit")).toBe("60");
    const json = (await res.json()) as { post: { status: string } };
    expect(json.post.status).toBe("draft");
    expect(emitted.some((e) => e.event === "outbox:created")).toBe(true);
  });

  it("POST / creates a scheduled post when publishAt is given", async () => {
    const res = await fetch(`${base}/api/outbox`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "twitter", body: "hi", publishAt: Date.now() + 60_000 })
    });
    const json = (await res.json()) as { post: { status: string } };
    expect(json.post.status).toBe("scheduled");
  });

  it("POST / rejects an over-280-char X post (server-side enforcement)", async () => {
    const res = await fetch(`${base}/api/outbox`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "twitter", body: "a".repeat(281) })
    });
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("280");
  });

  it("POST / requires a platform", async () => {
    const res = await fetch(`${base}/api/outbox`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "hi" })
    });
    expect(res.status).toBe(400);
  });

  it("GET / lists posts with filters", async () => {
    repo.create({ platform: "twitter", body: "a", publishAt: 1000 });
    repo.create({ platform: "linkedin", body: "b" });
    const res = await fetch(`${base}/api/outbox?platform=twitter`);
    const json = (await res.json()) as { posts: Array<{ platform: string }> };
    expect(json.posts).toHaveLength(1);
    expect(json.posts[0]?.platform).toBe("twitter");
  });

  it("GET /:id returns 404 for a missing post", async () => {
    const res = await fetch(`${base}/api/outbox/999`);
    expect(res.status).toBe(404);
  });

  it("GET /post-limits exposes the X 280 cap", async () => {
    const res = await fetch(`${base}/api/outbox/post-limits`);
    const json = (await res.json()) as { limits: { twitter: { charLimit: number } } };
    expect(json.limits.twitter.charLimit).toBe(280);
  });

  it("PUT /:id edits a draft", async () => {
    const created = repo.create({ platform: "twitter", body: "old" });
    const res = await fetch(`${base}/api/outbox/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "new" })
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { post: { body: string } };
    expect(json.post.body).toBe("new");
  });

  it("POST /:id/reschedule moves publish_at and keeps platform", async () => {
    const created = repo.create({ platform: "linkedin", body: "x", publishAt: 1000 });
    const res = await fetch(`${base}/api/outbox/${created.id}/reschedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // A malicious platform field must be ignored — platform is immutable.
      body: JSON.stringify({ publishAt: 9000, platform: "twitter" })
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { post: { publishAt: number; platform: string } };
    expect(json.post.publishAt).toBe(9000);
    expect(json.post.platform).toBe("linkedin");
  });

  it("POST /:id/reschedule rejects a draft with 409", async () => {
    const created = repo.create({ platform: "twitter", body: "x" });
    const res = await fetch(`${base}/api/outbox/${created.id}/reschedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publishAt: 9000 })
    });
    expect(res.status).toBe(409);
  });

  it("POST /:id/schedule schedules a draft", async () => {
    const created = repo.create({ platform: "twitter", body: "x" });
    const res = await fetch(`${base}/api/outbox/${created.id}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publishAt: 5000 })
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { post: { status: string } };
    expect(json.post.status).toBe("scheduled");
  });

  it("POST /:id/retry requeues a failed post", async () => {
    const created = repo.create({ platform: "twitter", body: "x", publishAt: 1000 });
    repo.claimDue(2000, 10);
    repo.markFailed(created.id, "boom");
    const res = await fetch(`${base}/api/outbox/${created.id}/retry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { post: { status: string } };
    expect(json.post.status).toBe("scheduled");
  });

  it("DELETE /:id deletes a post", async () => {
    const created = repo.create({ platform: "twitter", body: "x" });
    const res = await fetch(`${base}/api/outbox/${created.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(repo.get(created.id)).toBeUndefined();
  });

  it("GET /dlq lists dead-lettered publishes", async () => {
    dlq.land({
      platform: "twitter",
      opKind: "outbox.publish",
      payload: {},
      lastError: "x",
      attempts: 5
    });
    const res = await fetch(`${base}/api/outbox/dlq`);
    const json = (await res.json()) as { entries: Array<{ lastError: string }> };
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0]?.lastError).toBe("x");
  });
});
