import type { Database } from "better-sqlite3";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../../db/index.js";
import { Metrics } from "../metrics.js";
import { createApp } from "../app.js";
import { BrandVoiceRepository } from "../../personality/rulebook-repository.js";
import { AutoReplyAuditRepository } from "../../routing/audit-repository.js";
import { AutoReplyPipeline } from "../../routing/pipeline.js";
import { createAutoReplyRouter } from "./router.js";

const THRESHOLDS = { confidenceThreshold: 0.85, voiceThreshold: 0.8 };

function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe("auto-reply router", () => {
  let db: Database;
  let rulebook: BrandVoiceRepository;
  let audit: AutoReplyAuditRepository;
  let sent: string[];
  let enabled: boolean;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    db = openDb({ path: ":memory:" });
    rulebook = new BrandVoiceRepository(db);
    audit = new AutoReplyAuditRepository(db);
    sent = [];
    enabled = true;
    const pipeline = new AutoReplyPipeline({
      rulebook,
      audit,
      thresholds: () => THRESHOLDS,
      enabled: () => enabled,
      send: (text) => {
        sent.push(text);
      }
    });
    const router = createAutoReplyRouter({
      rulebook,
      audit,
      pipeline,
      thresholds: () => THRESHOLDS,
      enabled: () => enabled
    });
    const app = createApp({
      metrics: new Metrics(),
      checkReadiness: () => ({ db: true, config: true, vault: true }),
      autoReplyRouter: router
    });
    ({ server, base } = await listen(app));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  async function put(path: string, body: unknown): Promise<Response> {
    return fetch(`${base}${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  }
  async function post(path: string, body: unknown): Promise<Response> {
    return fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  it("GET /config returns posture + thresholds and rate-limits", async () => {
    const res = await fetch(`${base}/api/auto-reply/config`);
    expect(res.status).toBe(200);
    expect(res.headers.get("ratelimit-limit")).toBe("60");
    const json = (await res.json()) as { enabled: boolean; thresholds: typeof THRESHOLDS };
    expect(json.enabled).toBe(true);
    expect(json.thresholds.confidenceThreshold).toBe(0.85);
  });

  it("GET /rulebook returns the empty default", async () => {
    const res = await fetch(`${base}/api/auto-reply/rulebook`);
    const json = (await res.json()) as { rulebook: { tone: string } };
    expect(json.rulebook).toEqual({ tone: "", bannedWords: [], exemplars: [] });
  });

  it("PUT /rulebook persists and round-trips", async () => {
    const res = await put("/api/auto-reply/rulebook", {
      tone: "warm",
      bannedWords: ["spam", "spam"],
      exemplars: ["hi"]
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rulebook: { bannedWords: string[] } };
    expect(json.rulebook.bannedWords).toEqual(["spam"]);
    const reread = await (await fetch(`${base}/api/auto-reply/rulebook`)).json();
    expect((reread as { rulebook: { tone: string } }).rulebook.tone).toBe("warm");
  });

  it("PUT /rulebook rejects a malformed body with 422", async () => {
    const res = await put("/api/auto-reply/rulebook", { tone: 42 });
    expect(res.status).toBe(422);
  });

  it("POST /score scores a draft against the live rulebook", async () => {
    await put("/api/auto-reply/rulebook", { tone: "warm", bannedWords: ["spam"], exemplars: [] });
    const res = await post("/api/auto-reply/score", { draft: "warm hello" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { voice: { score: number; bannedHits: string[] } };
    expect(json.voice.score).toBeGreaterThan(0);
    const vetoed = await post("/api/auto-reply/score", { draft: "spam" });
    const vetoedJson = (await vetoed.json()) as { voice: { score: number } };
    expect(vetoedJson.voice.score).toBe(0);
  });

  it("POST /score rejects a missing draft with 422", async () => {
    const res = await post("/api/auto-reply/score", {});
    expect(res.status).toBe(422);
  });

  it("POST /evaluate auto-sends a high-scoring draft", async () => {
    await put("/api/auto-reply/rulebook", {
      tone: "warm concise reply",
      bannedWords: [],
      exemplars: []
    });
    const res = await post("/api/auto-reply/evaluate", {
      threadId: "t-1",
      prompt: "hi?",
      draft: "warm concise reply",
      confidence: 0.95
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { result: { status: string } };
    expect(json.result.status).toBe("sent");
    expect(sent).toEqual(["warm concise reply"]);
  });

  it("POST /evaluate validates confidence bounds", async () => {
    const res = await post("/api/auto-reply/evaluate", {
      threadId: "t-1",
      prompt: "hi",
      draft: "x",
      confidence: 1.5
    });
    expect(res.status).toBe(422);
  });

  it("POST /evaluate then resolve approves a queued draft", async () => {
    const evalRes = await post("/api/auto-reply/evaluate", {
      threadId: "t-9",
      prompt: "hi",
      draft: "needs review",
      confidence: 0.4
    });
    const evalJson = (await evalRes.json()) as {
      result: { status: string; audit: { id: number } };
    };
    expect(evalJson.result.status).toBe("queued");
    const id = evalJson.result.audit.id;
    const res = await post(`/api/auto-reply/audit/${id}/resolve`, { approve: true });
    expect(res.status).toBe(200);
    expect(sent).toEqual(["needs review"]);
  });

  it("POST resolve returns 409 on an already-resolved row", async () => {
    await put("/api/auto-reply/rulebook", {
      tone: "warm concise reply",
      bannedWords: [],
      exemplars: []
    });
    const evalRes = await post("/api/auto-reply/evaluate", {
      threadId: "t-1",
      prompt: "hi",
      draft: "warm concise reply",
      confidence: 0.95
    });
    const id = ((await evalRes.json()) as { result: { audit: { id: number } } }).result.audit.id;
    const res = await post(`/api/auto-reply/audit/${id}/resolve`, { approve: true });
    expect(res.status).toBe(409);
  });

  it("POST resolve requires a boolean approve", async () => {
    const res = await post("/api/auto-reply/audit/1/resolve", {});
    expect(res.status).toBe(422);
  });

  it("GET /audit lists rows filtered by thread", async () => {
    await post("/api/auto-reply/evaluate", {
      threadId: "alpha",
      prompt: "p",
      draft: "d",
      confidence: 0.4
    });
    await post("/api/auto-reply/evaluate", {
      threadId: "beta",
      prompt: "p",
      draft: "d",
      confidence: 0.4
    });
    const res = await fetch(`${base}/api/auto-reply/audit?threadId=alpha`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { audits: Array<{ threadId: string }> };
    expect(json.audits).toHaveLength(1);
    expect(json.audits[0].threadId).toBe("alpha");
  });

  it("POST /evaluate rejects a missing draft, prompt, or threadId with 422", async () => {
    expect((await post("/api/auto-reply/evaluate", { threadId: "t", prompt: "p" })).status).toBe(
      422
    );
    expect(
      (await post("/api/auto-reply/evaluate", { threadId: "t", draft: "d", confidence: 0.4 }))
        .status
    ).toBe(422);
    expect(
      (await post("/api/auto-reply/evaluate", { prompt: "p", draft: "d", confidence: 0.4 })).status
    ).toBe(422);
  });

  it("POST /evaluate persists optional platform, contactId, and model", async () => {
    const res = await post("/api/auto-reply/evaluate", {
      threadId: "t-meta",
      contactId: "c-1",
      platform: "twitter",
      model: "gemma",
      prompt: "hi",
      draft: "d",
      confidence: 0.4
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      result: { audit: { platform: string; contactId: string; model: string } };
    };
    expect(json.result.audit.platform).toBe("twitter");
    expect(json.result.audit.contactId).toBe("c-1");
    expect(json.result.audit.model).toBe("gemma");
  });

  it("POST resolve returns 400 for a non-numeric audit id", async () => {
    const res = await post("/api/auto-reply/audit/not-a-number/resolve", { approve: true });
    expect(res.status).toBe(400);
  });

  it("GET /audit filters by since/until time range and honours limit", async () => {
    const repoAudit = new AutoReplyAuditRepository(db, { now: () => 100 });
    repoAudit.record({
      threadId: "ranged",
      prompt: "p",
      draftText: "d",
      confidence: 0.4,
      voiceMatch: 0,
      toneMatch: 0,
      bannedHits: [],
      decision: "queue"
    });
    const res = await fetch(`${base}/api/auto-reply/audit?since=50&until=150&limit=1`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { audits: Array<{ threadId: string }> };
    expect(json.audits).toHaveLength(1);
    expect(json.audits[0].threadId).toBe("ranged");
  });
});
