import { describe, expect, it, vi } from "vitest";

import type { SocialDmRequest } from "../../../channels/social/dm-sender.js";
import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";
import { InstagramDmSender } from "./dm-sender.js";
import type { IgAccount } from "./publisher.js";

const account: IgAccount = { igUserId: "ig-1", accessToken: "tok" };

function passthroughDispatcher(): MetaDispatcher {
  return {
    dispatch: vi.fn(async (_op: unknown, run: () => Promise<unknown>) => ({
      ok: true,
      value: await run(),
      attempts: 1
    }))
  } as unknown as MetaDispatcher;
}

describe("InstagramDmSender", () => {
  it("supports only instagram", () => {
    const sender = new InstagramDmSender({
      client: {} as MetaGraphClient,
      dispatcher: passthroughDispatcher(),
      getAccount: async () => account
    });
    expect(sender.supports("instagram")).toBe(true);
    expect(sender.supports("Instagram")).toBe(true);
    expect(sender.supports("facebook")).toBe(false);
  });

  it("sends a DM via the messages endpoint", async () => {
    let captured: { path: string; body?: Record<string, unknown> } | undefined;
    const client = {
      post: vi.fn(async (path: string, o: { body?: Record<string, unknown> }) => {
        captured = { path, body: o.body };
        return { message_id: "mid-1", recipient_id: "u9" };
      })
    } as unknown as MetaGraphClient;
    const sender = new InstagramDmSender({
      client,
      dispatcher: passthroughDispatcher(),
      getAccount: async () => account,
      now: () => 1234
    });

    const req: SocialDmRequest = { platform: "instagram", recipientId: "u9", text: "hi there" };
    const result = await sender.sendDm(req);

    expect(result).toEqual({
      platform: "instagram",
      recipientId: "u9",
      messageId: "mid-1",
      deliveredAt: 1234
    });
    expect(captured?.path).toBe("/ig-1/messages");
    expect(captured?.body).toEqual({
      recipient: JSON.stringify({ id: "u9" }),
      message: JSON.stringify({ text: "hi there" })
    });
  });

  it("throws when no account is connected", async () => {
    const sender = new InstagramDmSender({
      client: {} as MetaGraphClient,
      dispatcher: passthroughDispatcher(),
      getAccount: async () => undefined
    });
    await expect(
      sender.sendDm({ platform: "instagram", recipientId: "u", text: "x" })
    ).rejects.toThrow(/no connected Instagram account/);
  });

  it("throws when the dispatcher reports failure", async () => {
    const failing = {
      dispatch: vi.fn(async () => ({ ok: false, attempts: 1, error: new Error("boom"), dlqId: 1 }))
    } as unknown as MetaDispatcher;
    const sender = new InstagramDmSender({
      client: { post: vi.fn() } as unknown as MetaGraphClient,
      dispatcher: failing,
      getAccount: async () => account
    });
    await expect(
      sender.sendDm({ platform: "instagram", recipientId: "u", text: "x" })
    ).rejects.toThrow("boom");
  });

  it("omits messageId when the API returns none", async () => {
    const client = {
      post: vi.fn(async () => ({ recipient_id: "u9" }))
    } as unknown as MetaGraphClient;
    const sender = new InstagramDmSender({
      client,
      dispatcher: passthroughDispatcher(),
      getAccount: async () => account,
      now: () => 5
    });
    const result = await sender.sendDm({ platform: "instagram", recipientId: "u9", text: "x" });
    expect(result.messageId).toBeUndefined();
    expect(result.deliveredAt).toBe(5);
  });
});
