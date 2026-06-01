import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../db/index.js";
import { BrandVoiceRepository } from "../personality/rulebook-repository.js";
import { AutoReplyAuditRepository } from "./audit-repository.js";
import {
  AutoReplyPipeline,
  AutoReplyResolveError,
  type AutoReplyPipelineDeps,
  type AutoReplyRequest
} from "./pipeline.js";

const THRESHOLDS = { confidenceThreshold: 0.85, voiceThreshold: 0.8 };

function request(overrides: Partial<AutoReplyRequest> = {}): AutoReplyRequest {
  return {
    threadId: "t-1",
    platform: "twitter",
    prompt: "hello?",
    draft: "warm concise reply",
    confidence: 0.95,
    ...overrides
  };
}

describe("AutoReplyPipeline", () => {
  let db: Database;
  let rulebook: BrandVoiceRepository;
  let audit: AutoReplyAuditRepository;
  let send: ReturnType<typeof vi.fn>;
  let emit: ReturnType<typeof vi.fn>;
  let enabled: boolean;

  function build(): AutoReplyPipeline {
    const deps: AutoReplyPipelineDeps = {
      rulebook,
      audit,
      thresholds: () => THRESHOLDS,
      enabled: () => enabled,
      send,
      emit
    };
    return new AutoReplyPipeline(deps);
  }

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    rulebook = new BrandVoiceRepository(db);
    audit = new AutoReplyAuditRepository(db);
    send = vi.fn();
    emit = vi.fn();
    enabled = true;
    // A rulebook the happy-path draft scores 1.0 against.
    rulebook.save({ tone: "warm concise reply", bannedWords: ["spam"], exemplars: [] });
  });

  afterEach(() => {
    db.close();
  });

  it("auto-sends when posture is on and both gates pass", async () => {
    const result = await build().evaluate(request());
    expect(result.status).toBe("sent");
    expect(result.decision.action).toBe("auto_send");
    expect(send).toHaveBeenCalledOnce();
    expect(result.audit.outcome).toBe("sent");
    expect(result.audit.finalText).toBe("warm concise reply");
    expect(emit).toHaveBeenCalledWith("autoReply:sent", result.audit);
  });

  it("queues — never sends — when the posture switch is off, even with perfect scores", async () => {
    enabled = false;
    const result = await build().evaluate(request());
    expect(result.status).toBe("queued");
    expect(send).not.toHaveBeenCalled();
    expect(result.audit.outcome).toBe("pending");
    expect(emit).toHaveBeenCalledWith("autoReply:queued", result.audit);
  });

  it("queues a low-confidence draft for approval", async () => {
    const result = await build().evaluate(request({ confidence: 0.5 }));
    expect(result.status).toBe("queued");
    expect(result.decision.action).toBe("queue");
    expect(send).not.toHaveBeenCalled();
  });

  it("queues a banned-word draft (voice vetoed to 0)", async () => {
    const result = await build().evaluate(request({ draft: "spam spam spam" }));
    expect(result.voice.score).toBe(0);
    expect(result.status).toBe("queued");
    expect(send).not.toHaveBeenCalled();
  });

  it("records the prompt, draft, and both scores on the audit row", async () => {
    const result = await build().evaluate(request({ confidence: 0.5 }));
    const row = audit.get(result.audit.id);
    expect(row?.prompt).toBe("hello?");
    expect(row?.draftText).toBe("warm concise reply");
    expect(row?.confidence).toBe(0.5);
    expect(row?.voiceMatch).toBe(1);
  });

  it("approves a queued draft as-is without flagging an override", async () => {
    const queued = await build().evaluate(request({ confidence: 0.5 }));
    const resolved = await build().resolve(queued.audit.id, { approve: true });
    expect(resolved.outcome).toBe("sent");
    expect(resolved.finalText).toBe("warm concise reply");
    expect(resolved.humanOverride).toBe(false);
    expect(send).toHaveBeenCalledWith(
      "warm concise reply",
      expect.objectContaining({ threadId: "t-1" })
    );
  });

  it("flags human_override when the approved text is edited", async () => {
    const queued = await build().evaluate(request({ confidence: 0.5 }));
    const resolved = await build().resolve(queued.audit.id, {
      approve: true,
      editedText: "a human wrote this"
    });
    expect(resolved.finalText).toBe("a human wrote this");
    expect(resolved.humanOverride).toBe(true);
  });

  it("rejects a queued draft without sending", async () => {
    const queued = await build().evaluate(request({ confidence: 0.5 }));
    const resolved = await build().resolve(queued.audit.id, { approve: false });
    expect(resolved.outcome).toBe("rejected");
    expect(send).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("autoReply:rejected", resolved);
  });

  it("throws when resolving a missing row", async () => {
    await expect(build().resolve(999, { approve: true })).rejects.toThrow(AutoReplyResolveError);
  });

  it("throws when resolving an already-resolved row", async () => {
    const pipeline = build();
    const sent = await pipeline.evaluate(request());
    await expect(pipeline.resolve(sent.audit.id, { approve: true })).rejects.toThrow(
      AutoReplyResolveError
    );
  });
});
