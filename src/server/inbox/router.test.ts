import type { Database } from "better-sqlite3";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../../db/index.js";
import { Metrics } from "../metrics.js";
import { createApp } from "../app.js";
import { SocialBrainRepository } from "../../platform/social-brain/repository.js";
import type {
  SocialDmRequest,
  SocialDmResult,
  SocialDmSender
} from "../../channels/social/dm-sender.js";
import { createInboxRouter } from "./router.js";

function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

class FakeDmSender implements SocialDmSender {
  sent: SocialDmRequest[] = [];
  constructor(private readonly supported: Set<string>) {}
  supports(platform: string): boolean {
    return this.supported.has(platform);
  }
  async sendDm(request: SocialDmRequest): Promise<SocialDmResult> {
    this.sent.push(request);
    return {
      platform: request.platform,
      recipientId: request.recipientId,
      messageId: "sent-1",
      deliveredAt: Date.now()
    };
  }
}

describe("inbox router", () => {
  let db: Database;
  let brain: SocialBrainRepository;
  let server: Server;
  let base: string;
  let dmSender: FakeDmSender;
  let emitted: Array<{ event: string; payload: unknown }>;

  beforeEach(async () => {
    db = openDb({ path: ":memory:" });
    brain = new SocialBrainRepository(db);
    dmSender = new FakeDmSender(new Set(["instagram"]));
    emitted = [];
    const inboxRouter = createInboxRouter({
      db,
      brain,
      dmSender,
      emit: (event, payload) => emitted.push({ event, payload })
    });
    const app = createApp({
      metrics: new Metrics(),
      checkReadiness: () => ({ db: true, config: true, vault: true }),
      inboxRouter
    });
    ({ server, base } = await listen(app));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  function seed(
    platform: string,
    threadId: string,
    handle: string,
    body: string,
    kind: "dm" | "comment" = "dm"
  ) {
    const contact = brain.upsertContact({ platform, platformContactId: `c-${threadId}`, handle });
    const thread = brain.upsertThread({
      platform,
      platformThreadId: threadId,
      contactId: contact.id
    });
    brain.upsertMessage({
      platform,
      platformMessageId: `m-${threadId}`,
      threadId: thread.id,
      contactId: contact.id,
      direction: "inbound",
      body,
      metadata: { kind }
    });
    return thread;
  }

  it("GET /threads lists threads with a rate-limit header", async () => {
    seed("instagram", "t1", "alice", "hello");
    const res = await fetch(`${base}/api/inbox/threads`);
    expect(res.status).toBe(200);
    expect(res.headers.get("ratelimit-limit")).toBe("60");
    const body = (await res.json()) as { threads: Array<{ platformThreadId: string }> };
    expect(body.threads.map((t) => t.platformThreadId)).toContain("t1");
  });

  it("GET /threads supports search and platform filters", async () => {
    seed("instagram", "t1", "alice", "where is my refund");
    seed("instagram", "t2", "bob", "love it");
    const res = await fetch(`${base}/api/inbox/threads?search=refund`);
    const body = (await res.json()) as { threads: Array<{ platformThreadId: string }> };
    expect(body.threads.map((t) => t.platformThreadId)).toEqual(["t1"]);
  });

  it("GET /threads/:id returns detail; 404 for unknown; 400 for bad id", async () => {
    const thread = seed("instagram", "t1", "alice", "hello");
    const ok = await fetch(`${base}/api/inbox/threads/${thread.id}`);
    expect(ok.status).toBe(200);
    expect((await fetch(`${base}/api/inbox/threads/99999`)).status).toBe(404);
    expect((await fetch(`${base}/api/inbox/threads/abc`)).status).toBe(400);
  });

  it("POST /threads/:id/reply sends a DM through the registry", async () => {
    const thread = seed("instagram", "t1", "alice", "hello");
    const res = await fetch(`${base}/api/inbox/threads/${thread.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "hi back" })
    });
    expect(res.status).toBe(200);
    // Mutation endpoints are rate-limited too (60/min/IP), not just the GETs.
    expect(res.headers.get("ratelimit-limit")).toBe("60");
    const body = (await res.json()) as { delivered: boolean };
    expect(body.delivered).toBe(true);
    expect(dmSender.sent).toHaveLength(1);
    expect(dmSender.sent[0].recipientId).toBe("c-t1");
    expect(emitted.some((e) => e.event === "inbox:reply")).toBe(true);
  });

  it("POST reply rejects an over-limit body with 422", async () => {
    const thread = seed("instagram", "t1", "alice", "hello");
    const res = await fetch(`${base}/api/inbox/threads/${thread.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "x".repeat(1001) })
    });
    expect(res.status).toBe(422);
    expect(dmSender.sent).toHaveLength(0);
  });

  it("POST reply records a comment locally when DMs are unsupported (LinkedIn)", async () => {
    const thread = seed("linkedin", "t1", "bob", "a comment", "comment");
    const res = await fetch(`${base}/api/inbox/threads/${thread.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "thanks!" })
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { delivered: boolean; recorded: boolean };
    expect(body.delivered).toBe(false);
    expect(body.recorded).toBe(true);
    expect(dmSender.sent).toHaveLength(0);
  });

  it("POST reply records a comment locally when kind=comment on a DM-capable platform", async () => {
    const thread = seed("instagram", "t1", "alice", "nice");
    const res = await fetch(`${base}/api/inbox/threads/${thread.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "thank you", kind: "comment" })
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { delivered: boolean; recorded: boolean };
    expect(body.delivered).toBe(false);
    expect(body.recorded).toBe(true);
    expect(dmSender.sent).toHaveLength(0);
  });

  it("POST reply 400 for a bad id and 404 for an unknown thread", async () => {
    expect(
      (
        await fetch(`${base}/api/inbox/threads/abc/reply`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: "hi" })
        })
      ).status
    ).toBe(400);
    expect(
      (
        await fetch(`${base}/api/inbox/threads/99999/reply`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: "hi" })
        })
      ).status
    ).toBe(404);
  });

  it("POST reply 422 when the DM-capable platform has no registered sender", async () => {
    // twitter is DM-capable per the limits table but the fake sender only
    // supports instagram, so the registry rejects it.
    const thread = seed("twitter", "t1", "carol", "dm me");
    const res = await fetch(`${base}/api/inbox/threads/${thread.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "hi" })
    });
    expect(res.status).toBe(422);
    expect(dmSender.sent).toHaveLength(0);
  });

  it("POST reply 422 when the thread has no resolvable DM recipient", async () => {
    const thread = brain.upsertThread({ platform: "instagram", platformThreadId: "no-contact" });
    const res = await fetch(`${base}/api/inbox/threads/${thread.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "hi" })
    });
    expect(res.status).toBe(422);
  });

  it("POST /threads/:id/read 400 for a bad id and 404 for an unknown thread", async () => {
    expect((await fetch(`${base}/api/inbox/threads/abc/read`, { method: "POST" })).status).toBe(
      400
    );
    expect((await fetch(`${base}/api/inbox/threads/99999/read`, { method: "POST" })).status).toBe(
      404
    );
  });

  it("POST /threads/:id/read marks the thread read", async () => {
    const thread = seed("instagram", "t1", "alice", "hello");
    const res = await fetch(`${base}/api/inbox/threads/${thread.id}/read`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(emitted.some((e) => e.event === "inbox:read")).toBe(true);
    const detail = await (await fetch(`${base}/api/inbox/threads/${thread.id}`)).json();
    expect((detail as { thread: { dms: unknown[] } }).thread.dms).toHaveLength(1);
  });

  describe("rules", () => {
    const rule = {
      name: "urgent",
      condition: { field: "message.body", op: "contains", value: "urgent" },
      actions: { priority: "high" }
    };

    it("creates, lists, updates, and deletes a rule", async () => {
      const created = await fetch(`${base}/api/inbox/rules`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rule)
      });
      expect(created.status).toBe(201);
      expect(created.headers.get("ratelimit-limit")).toBe("60");
      const { rule: createdRule } = (await created.json()) as { rule: { id: number } };

      const list = await (await fetch(`${base}/api/inbox/rules`)).json();
      expect((list as { rules: unknown[] }).rules).toHaveLength(1);

      const updated = await fetch(`${base}/api/inbox/rules/${createdRule.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...rule, name: "renamed" })
      });
      expect(updated.status).toBe(200);

      const del = await fetch(`${base}/api/inbox/rules/${createdRule.id}`, { method: "DELETE" });
      expect(del.status).toBe(200);
      expect(
        (await fetch(`${base}/api/inbox/rules/${createdRule.id}`, { method: "DELETE" })).status
      ).toBe(404);
    });

    it("rejects a malformed rule with 400", async () => {
      const res = await fetch(`${base}/api/inbox/rules`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "bad", condition: { field: "x", op: "danger" }, actions: {} })
      });
      expect(res.status).toBe(400);
    });

    it("PUT rejects a bad id (400), unknown rule (404), and malformed body (400)", async () => {
      expect(
        (
          await fetch(`${base}/api/inbox/rules/abc`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(rule)
          })
        ).status
      ).toBe(400);
      expect(
        (
          await fetch(`${base}/api/inbox/rules/99999`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(rule)
          })
        ).status
      ).toBe(404);

      const created = await (
        await fetch(`${base}/api/inbox/rules`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(rule)
        })
      ).json();
      const id = (created as { rule: { id: number } }).rule.id;
      const bad = await fetch(`${base}/api/inbox/rules/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x", condition: { field: "x", op: "danger" }, actions: {} })
      });
      expect(bad.status).toBe(400);
    });

    it("DELETE and firings reject a bad id with 400", async () => {
      expect((await fetch(`${base}/api/inbox/rules/abc`, { method: "DELETE" })).status).toBe(400);
      expect((await fetch(`${base}/api/inbox/rules/abc/firings`)).status).toBe(400);
    });

    it("exposes a rule's firing audit trail", async () => {
      const res = await fetch(`${base}/api/inbox/rules/1/firings`);
      expect(res.status).toBe(200);
      expect((await res.json()) as { firings: unknown[] }).toHaveProperty("firings");
    });
  });

  it("GET /platform-limits returns the limits table", async () => {
    const res = await fetch(`${base}/api/inbox/platform-limits`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { limits: Record<string, { dmSupported: boolean }> };
    expect(body.limits.linkedin.dmSupported).toBe(false);
  });
});
