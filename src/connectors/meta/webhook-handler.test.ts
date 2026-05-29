import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { WebhookEvent } from "../../platform/index.js";
import { createMetaWebhookHandler } from "./webhook-handler.js";

const SECRET = "app-secret";

function sign(body: Buffer): string {
  return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

describe("createMetaWebhookHandler", () => {
  it("uses the lower-cased platform key", () => {
    const handler = createMetaWebhookHandler({
      platform: "Instagram",
      appSecret: SECRET,
      onEvent: vi.fn()
    });
    expect(handler.platform).toBe("instagram");
  });

  it("verifies a correctly signed body", () => {
    const handler = createMetaWebhookHandler({
      platform: "instagram",
      appSecret: SECRET,
      onEvent: vi.fn()
    });
    const body = Buffer.from(JSON.stringify({ object: "instagram" }));
    expect(handler.verify(body, { "x-hub-signature-256": sign(body) })).toBe(true);
  });

  it("rejects a tampered body", () => {
    const handler = createMetaWebhookHandler({
      platform: "instagram",
      appSecret: SECRET,
      onEvent: vi.fn()
    });
    const body = Buffer.from(JSON.stringify({ object: "instagram" }));
    const sig = sign(body);
    const tampered = Buffer.from(JSON.stringify({ object: "page" }));
    expect(handler.verify(tampered, { "x-hub-signature-256": sig })).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const handler = createMetaWebhookHandler({
      platform: "instagram",
      appSecret: SECRET,
      onEvent: vi.fn()
    });
    expect(handler.verify(Buffer.from("{}"), {})).toBe(false);
  });

  it("extracts a stable event id from entries", () => {
    const handler = createMetaWebhookHandler({
      platform: "instagram",
      appSecret: SECRET,
      onEvent: vi.fn()
    });
    const id = handler.extractEventId?.(
      {
        entry: [
          { id: "e1", time: 100 },
          { id: "e2", time: 200 }
        ]
      },
      {}
    );
    expect(id).toBe("instagram:e1:100,e2:200");
  });

  it("returns undefined when no entries carry an id+time", () => {
    const handler = createMetaWebhookHandler({
      platform: "instagram",
      appSecret: SECRET,
      onEvent: vi.fn()
    });
    expect(handler.extractEventId?.({ entry: [{ id: "e1" }] }, {})).toBeUndefined();
    expect(handler.extractEventId?.({}, {})).toBeUndefined();
  });

  it("forwards verified events to onEvent", async () => {
    const onEvent = vi.fn();
    const handler = createMetaWebhookHandler({
      platform: "instagram",
      appSecret: SECRET,
      onEvent
    });
    const event: WebhookEvent = {
      platform: "instagram",
      payload: { object: "instagram" },
      headers: {},
      rawBody: Buffer.from("{}")
    };
    await handler.handle(event);
    expect(onEvent).toHaveBeenCalledWith(event);
  });
});
