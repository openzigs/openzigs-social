import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPost,
  deletePost,
  fetchOutbox,
  fetchOutboxDlq,
  reschedulePost,
  retryPost,
  schedulePost
} from "./outbox";

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function json(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchOutbox", () => {
  it("requests with no query string when unfiltered", async () => {
    const fetchMock = mockFetch(() => json({ timestamp: "t", posts: [{ id: 1 }] }));
    const posts = await fetchOutbox();
    expect(posts).toEqual([{ id: 1 }]);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/outbox$/);
  });

  it("encodes status, platform, and date filters", async () => {
    const fetchMock = mockFetch(() => json({ timestamp: "t", posts: [] }));
    await fetchOutbox({ status: ["scheduled", "failed"], platform: "twitter", from: 1, to: 2 });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("status=scheduled%2Cfailed");
    expect(url).toContain("platform=twitter");
    expect(url).toContain("from=1");
    expect(url).toContain("to=2");
  });

  it("throws the server error message on a non-ok response", async () => {
    mockFetch(() => json({ error: "boom" }, false, 500));
    await expect(fetchOutbox()).rejects.toThrow("boom");
  });
});

describe("createPost", () => {
  it("POSTs the payload and returns the created post", async () => {
    const fetchMock = mockFetch(() => json({ post: { id: 7, status: "draft" } }));
    const post = await createPost({ platform: "twitter", body: "hi" });
    expect(post).toEqual({ id: 7, status: "draft" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ platform: "twitter", body: "hi" });
  });

  it("surfaces a 422 validation error", async () => {
    mockFetch(() =>
      json({ error: "post exceeds 280 character limit for X (Twitter)" }, false, 422)
    );
    await expect(createPost({ platform: "twitter", body: "x".repeat(281) })).rejects.toThrow(
      /280 character limit/
    );
  });
});

describe("schedulePost / reschedulePost", () => {
  it("schedules with publishAt", async () => {
    const fetchMock = mockFetch(() => json({ post: { id: 1, status: "scheduled" } }));
    await schedulePost(1, 123);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/outbox\/1\/schedule$/);
    expect(JSON.parse(String(init?.body))).toEqual({ publishAt: 123 });
  });

  it("reschedules WITHOUT sending a platform field", async () => {
    const fetchMock = mockFetch(() => json({ post: { id: 1, status: "scheduled" } }));
    await reschedulePost(1, 456);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/outbox\/1\/reschedule$/);
    const payload = JSON.parse(String(init?.body));
    expect(payload).toEqual({ publishAt: 456 });
    expect(payload).not.toHaveProperty("platform");
  });

  it("throws on an illegal reschedule (409)", async () => {
    mockFetch(() => json({ error: "illegal outbox transition: draft → scheduled" }, false, 409));
    await expect(reschedulePost(1, 1)).rejects.toThrow(/illegal outbox transition/);
  });
});

describe("retryPost", () => {
  it("sends an empty body when no publishAt is given", async () => {
    const fetchMock = mockFetch(() => json({ post: { id: 1, status: "scheduled" } }));
    await retryPost(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({});
  });

  it("includes publishAt when provided", async () => {
    const fetchMock = mockFetch(() => json({ post: { id: 1, status: "scheduled" } }));
    await retryPost(1, 999);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ publishAt: 999 });
  });
});

describe("deletePost / fetchOutboxDlq", () => {
  it("DELETEs a post", async () => {
    const fetchMock = mockFetch(() => json({ ok: true }));
    await deletePost(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/outbox\/3$/);
    expect(init?.method).toBe("DELETE");
  });

  it("fetches the dead-letter queue", async () => {
    const fetchMock = mockFetch(() => json({ timestamp: "t", entries: [{ id: 1 }] }));
    const entries = await fetchOutboxDlq();
    expect(entries).toEqual([{ id: 1 }]);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/outbox\/dlq$/);
  });
});
