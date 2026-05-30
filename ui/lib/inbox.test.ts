import { afterEach, describe, expect, it, vi } from "vitest";

import {
  badgeMetaFor,
  fetchInboxThread,
  fetchInboxThreads,
  limitsFor,
  markThreadRead,
  sendInboxReply
} from "./inbox";

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl as never);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function json(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("limitsFor / badgeMetaFor", () => {
  it("resolves known limits case-insensitively", () => {
    expect(limitsFor("LinkedIn").dmSupported).toBe(false);
    expect(limitsFor("twitter").commentCharLimit).toBe(280);
  });

  it("falls back for unknown platforms", () => {
    expect(limitsFor("myspace").label).toBe("Unknown");
    expect(badgeMetaFor("myspace").label).toBe("myspace");
  });
});

describe("fetchInboxThreads", () => {
  it("requests threads with no query string when unfiltered", async () => {
    const fetchMock = mockFetch(() => json({ timestamp: "t", threads: [{ id: 1 }] }));
    const threads = await fetchInboxThreads();
    expect(threads).toEqual([{ id: 1 }]);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/inbox\/threads$/);
  });

  it("encodes platform and search filters", async () => {
    const fetchMock = mockFetch(() => json({ timestamp: "t", threads: [] }));
    await fetchInboxThreads({ platform: "linkedin", search: "hi there" });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("platform=linkedin");
    expect(url).toContain("search=hi+there");
  });

  it("throws on a non-ok response", async () => {
    mockFetch(() => json({}, false, 500));
    await expect(fetchInboxThreads()).rejects.toThrow(/HTTP 500/);
  });
});

describe("fetchInboxThread", () => {
  it("returns the thread payload", async () => {
    mockFetch(() => json({ timestamp: "t", thread: { id: 9 } }));
    await expect(fetchInboxThread(9)).resolves.toEqual({ id: 9 });
  });

  it("throws on failure", async () => {
    mockFetch(() => json({}, false, 404));
    await expect(fetchInboxThread(9)).rejects.toThrow(/HTTP 404/);
  });
});

describe("sendInboxReply", () => {
  it("posts the body and kind", async () => {
    const fetchMock = mockFetch(() => json({ ok: true }));
    await sendInboxReply(3, "hello", "dm");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/inbox\/threads\/3\/reply$/);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ body: "hello", kind: "dm" });
  });

  it("surfaces the server error message", async () => {
    mockFetch(() => json({ error: "char limit exceeded" }, false, 400));
    await expect(sendInboxReply(3, "x")).rejects.toThrow("char limit exceeded");
  });
});

describe("markThreadRead", () => {
  it("posts to the read endpoint", async () => {
    const fetchMock = mockFetch(() => json({ ok: true }));
    await markThreadRead(5);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/inbox\/threads\/5\/read$/);
  });

  it("throws on failure", async () => {
    mockFetch(() => json({}, false, 500));
    await expect(markThreadRead(5)).rejects.toThrow(/HTTP 500/);
  });
});
