import { describe, expect, it, vi } from "vitest";

import type {
  SocialDmRequest,
  SocialDmResult,
  SocialDmSender
} from "../../channels/social/dm-sender.js";
import { SocialDmSenderRegistry } from "./sender-registry.js";

function fakeSender(platform: string, overrides: Partial<SocialDmSender> = {}): SocialDmSender {
  return {
    supports: (p) => p.toLowerCase() === platform,
    sendDm: async (req: SocialDmRequest): Promise<SocialDmResult> => ({
      platform: req.platform,
      recipientId: req.recipientId,
      messageId: "m1",
      deliveredAt: 1
    }),
    ...overrides
  };
}

describe("SocialDmSenderRegistry", () => {
  it("routes a DM to the adapter that supports the platform", async () => {
    const reg = new SocialDmSenderRegistry();
    const igSend = vi.fn(fakeSender("instagram").sendDm);
    reg.register("instagram", fakeSender("instagram", { sendDm: igSend }));
    reg.register("x", fakeSender("x"));

    expect(reg.supports("instagram")).toBe(true);
    expect(reg.platforms().sort()).toEqual(["instagram", "x"]);

    const res = await reg.sendDm({ platform: "instagram", recipientId: "u1", text: "hi" });
    expect(res.messageId).toBe("m1");
    expect(igSend).toHaveBeenCalledOnce();
  });

  it("is case-insensitive on platform keys", async () => {
    const reg = new SocialDmSenderRegistry();
    reg.register("Instagram", fakeSender("instagram"));
    expect(reg.supports("INSTAGRAM")).toBe(true);
    await expect(
      reg.sendDm({ platform: "INSTAGRAM", recipientId: "u", text: "h" })
    ).resolves.toBeTruthy();
  });

  it("rejects duplicate platform registration", () => {
    const reg = new SocialDmSenderRegistry();
    reg.register("x", fakeSender("x"));
    expect(() => reg.register("x", fakeSender("x"))).toThrow(/already registered/);
  });

  it("throws when no adapter supports the platform", async () => {
    const reg = new SocialDmSenderRegistry();
    expect(reg.supports("bluesky")).toBe(false);
    await expect(reg.sendDm({ platform: "bluesky", recipientId: "u", text: "h" })).rejects.toThrow(
      /no DM sender/
    );
  });

  it("reports unsupported when the registered adapter declines the platform", () => {
    const reg = new SocialDmSenderRegistry();
    reg.register("x", fakeSender("x", { supports: () => false }));
    expect(reg.supports("x")).toBe(false);
  });
});
