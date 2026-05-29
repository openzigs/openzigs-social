import { describe, expect, it, vi } from "vitest";

import type { SocialDmRequest, SocialDmResult, SocialDmSender } from "../social/dm-sender.js";
import { parseDmCommand, relayDm } from "./dm-relay.js";

describe("parseDmCommand", () => {
  it("parses a well-formed command and lower-cases the platform", () => {
    const parsed = parseDmCommand("/dm Instagram @alice hello there");
    expect(parsed).toEqual({
      ok: true,
      request: { platform: "instagram", recipientId: "@alice", text: "hello there" }
    });
  });

  it("accepts an already-stripped argument string", () => {
    const parsed = parseDmCommand("twitter bob hi");
    expect(parsed).toMatchObject({ ok: true });
  });

  it.each([
    ["", "usage: /dm <platform> <recipient> <message>"],
    ["/dm", "usage: /dm <platform> <recipient> <message>"],
    ["/dm instagram", "missing recipient and message"],
    ["/dm instagram @alice", "missing message"],
    ["/dm BAD!platform @alice hi", "invalid platform name"]
  ])("rejects %j with a usage reason", (input, reason) => {
    expect(parseDmCommand(input)).toEqual({ ok: false, reason });
  });

  it("rejects an over-long message", () => {
    const long = "a".repeat(5000);
    const parsed = parseDmCommand(`/dm instagram @alice ${long}`);
    expect(parsed.ok).toBe(false);
  });
});

function sender(overrides: Partial<SocialDmSender> = {}): SocialDmSender {
  return {
    supports: () => true,
    sendDm: async (req: SocialDmRequest): Promise<SocialDmResult> => ({
      platform: req.platform,
      recipientId: req.recipientId,
      messageId: "m1",
      deliveredAt: 0
    }),
    ...overrides
  };
}

describe("relayDm", () => {
  const request: SocialDmRequest = { platform: "instagram", recipientId: "@alice", text: "hi" };

  it("reports unavailable when no sender is wired", async () => {
    const res = await relayDm(undefined, request);
    expect(res.ok).toBe(false);
  });

  it("reports unavailable when the platform is unsupported", async () => {
    const res = await relayDm(sender({ supports: () => false }), request);
    expect(res).toMatchObject({ ok: false });
  });

  it("delivers through a supporting sender", async () => {
    const send = vi.fn(sender().sendDm);
    const res = await relayDm(sender({ sendDm: send }), request);
    expect(res.ok).toBe(true);
    expect(send).toHaveBeenCalledWith(request);
  });

  it("captures adapter failures as a structured reason", async () => {
    const res = await relayDm(
      sender({
        sendDm: async () => {
          throw new Error("rate limited");
        }
      }),
      request
    );
    expect(res).toEqual({ ok: false, reason: "rate limited" });
  });

  it("handles non-Error throws", async () => {
    const res = await relayDm(
      sender({
        sendDm: async () => {
          throw "boom";
        }
      }),
      request
    );
    expect(res).toMatchObject({ ok: false, reason: "unknown delivery error" });
  });
});
