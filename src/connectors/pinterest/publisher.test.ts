import { describe, expect, it, vi } from "vitest";

import type { DlqEntry, DlqInput, DlqRepository, RateLimitBroker } from "../../platform/index.js";
import { PinterestDispatcher } from "./dispatcher.js";
import { PinterestPublisher } from "./publisher.js";
import { PinterestRestClient, type FetchLike } from "./rest-client.js";

function grantedBroker(): RateLimitBroker {
  return { acquire: vi.fn(async () => ({ granted: true })) } as unknown as RateLimitBroker;
}

function fakeDlq(): DlqRepository {
  let id = 0;
  return {
    land: vi.fn((input: DlqInput): DlqEntry => {
      id += 1;
      return { id, ...input, payloadJson: "{}", createdAt: "now" } as unknown as DlqEntry;
    })
  } as unknown as DlqRepository;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function build(fetchImpl: FetchLike) {
  const client = new PinterestRestClient({ fetchImpl });
  const dispatcher = new PinterestDispatcher({
    broker: grantedBroker(),
    dlq: fakeDlq(),
    retryOptions: { sleep: async () => undefined, random: () => 0 }
  });
  return new PinterestPublisher({ client, dispatcher });
}

describe("PinterestPublisher", () => {
  it("creates a board with default public privacy", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(201, { id: "board-1" }));
    const publisher = build(fetchImpl);

    const result = await publisher.createBoard("tok", { name: "My Board" });

    expect(result).toEqual({ boardId: "board-1" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("/boards");
    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({ name: "My Board", privacy: "PUBLIC" });
  });

  it("creates a pin with an image media source", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(201, { id: "pin-9" }));
    const publisher = build(fetchImpl);

    const result = await publisher.createPin("tok", {
      boardId: "board-1",
      imageUrl: "https://cdn.example.com/x.jpg",
      title: "Hi",
      link: "https://example.com"
    });

    expect(result).toEqual({ pinId: "pin-9" });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string);
    expect(body.board_id).toBe("board-1");
    expect(body.title).toBe("Hi");
    expect(body.link).toBe("https://example.com");
    expect(body.media_source).toEqual({
      source_type: "image_url",
      url: "https://cdn.example.com/x.jpg"
    });
  });

  it("throws when board id is missing in response", async () => {
    const publisher = build(vi.fn<FetchLike>(async () => jsonResponse(201, {})));
    await expect(publisher.createBoard("t", { name: "n" })).rejects.toThrow(/no board id/);
  });

  it("throws when pin id is missing in response", async () => {
    const publisher = build(vi.fn<FetchLike>(async () => jsonResponse(201, {})));
    await expect(
      publisher.createPin("t", { boardId: "b", imageUrl: "https://x/y.jpg" })
    ).rejects.toThrow(/no pin id/);
  });

  it("propagates a terminal API error", async () => {
    const publisher = build(vi.fn<FetchLike>(async () => jsonResponse(401, { message: "no" })));
    await expect(
      publisher.createPin("t", { boardId: "b", imageUrl: "https://x/y.jpg" })
    ).rejects.toMatchObject({
      name: "PinterestApiError",
      httpStatus: 401
    });
  });
});
