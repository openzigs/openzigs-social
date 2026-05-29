import { describe, expect, it, vi } from "vitest";

import {
  isTransientMetaError,
  MetaGraphClient,
  MetaGraphError,
  META_GRAPH_BASE_URL,
  META_GRAPH_VERSION,
  THREADS_GRAPH_BASE_URL,
  type FetchLike
} from "./graph-client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("MetaGraphClient", () => {
  it("exposes v25 host constants", () => {
    expect(META_GRAPH_VERSION).toBe("v25.0");
    expect(META_GRAPH_BASE_URL).toBe("https://graph.facebook.com/v25.0");
    expect(THREADS_GRAPH_BASE_URL).toBe("https://graph.threads.net/v25.0");
  });

  it("rejects an unsafe (loopback) base URL at construction", () => {
    expect(() => new MetaGraphClient({ baseUrl: "http://127.0.0.1/v25.0" })).toThrow();
  });

  it("GET puts the access token in the query string, not a header", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchImpl: FetchLike = async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse({ id: "123" });
    };
    const client = new MetaGraphClient({ fetchImpl });
    const out = await client.get<{ id: string }>("/me", {
      accessToken: "secret-token",
      query: { fields: "id,name" }
    });

    expect(out).toEqual({ id: "123" });
    const parsed = new URL(capturedUrl);
    expect(parsed.searchParams.get("access_token")).toBe("secret-token");
    expect(parsed.searchParams.get("fields")).toBe("id,name");
    expect(capturedInit?.method).toBe("GET");
    expect(capturedInit?.body).toBeUndefined();
  });

  it("POST puts the access token in the form body", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl: FetchLike = async (_url, init) => {
      capturedInit = init;
      return jsonResponse({ id: "post-1" });
    };
    const client = new MetaGraphClient({ fetchImpl });
    await client.post<{ id: string }>("ig-user/media", {
      accessToken: "tok",
      body: { caption: "hi", image_url: "https://cdn/x.jpg" }
    });

    expect(capturedInit?.method).toBe("POST");
    const body = capturedInit?.body as URLSearchParams;
    expect(body.get("access_token")).toBe("tok");
    expect(body.get("caption")).toBe("hi");
    expect(body.get("image_url")).toBe("https://cdn/x.jpg");
  });

  it("normalises a path missing its leading slash", async () => {
    let capturedUrl = "";
    const fetchImpl: FetchLike = async (url) => {
      capturedUrl = url;
      return jsonResponse({});
    };
    const client = new MetaGraphClient({ fetchImpl });
    await client.get("me/accounts", { accessToken: "t" });
    expect(new URL(capturedUrl).pathname).toBe("/v25.0/me/accounts");
  });

  it("skips undefined/null params", async () => {
    let capturedUrl = "";
    const fetchImpl: FetchLike = async (url) => {
      capturedUrl = url;
      return jsonResponse({});
    };
    const client = new MetaGraphClient({ fetchImpl });
    await client.get("/me", { accessToken: "t", query: { a: undefined, b: null, c: 1 } });
    const parsed = new URL(capturedUrl);
    expect(parsed.searchParams.has("a")).toBe(false);
    expect(parsed.searchParams.has("b")).toBe(false);
    expect(parsed.searchParams.get("c")).toBe("1");
  });

  it("parses a Meta error envelope into a terminal MetaGraphError", async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse(
        { error: { message: "Invalid OAuth token", type: "OAuthException", code: 190 } },
        400
      );
    const client = new MetaGraphClient({ fetchImpl });
    await expect(client.get("/me", { accessToken: "t" })).rejects.toMatchObject({
      name: "MetaGraphError",
      httpStatus: 400,
      code: 190,
      type: "OAuthException",
      transient: false
    });
  });

  it("flags a rate-limit error code as transient", async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse({ error: { message: "rate limited", code: 4 } }, 400);
    const client = new MetaGraphClient({ fetchImpl });
    const err = await client.get("/me", { accessToken: "t" }).catch((e: unknown) => e);
    expect(isTransientMetaError(err)).toBe(true);
  });

  it("treats HTTP 5xx and 429 with no envelope as transient", async () => {
    const make =
      (status: number): FetchLike =>
      async () =>
        new Response("", { status });
    for (const status of [429, 500, 503]) {
      const client = new MetaGraphClient({ fetchImpl: make(status) });
      const err = await client.get("/me", { accessToken: "t" }).catch((e: unknown) => e);
      expect(isTransientMetaError(err)).toBe(true);
    }
  });

  it("honours the is_transient flag from the envelope", async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse({ error: { message: "temporary", code: 999, is_transient: true } }, 400);
    const client = new MetaGraphClient({ fetchImpl });
    const err = await client.get("/me", { accessToken: "t" }).catch((e: unknown) => e);
    expect(isTransientMetaError(err)).toBe(true);
  });

  it("tolerates a non-JSON body", async () => {
    const fetchImpl: FetchLike = async () => new Response("not json", { status: 200 });
    const client = new MetaGraphClient({ fetchImpl });
    await expect(client.get("/me", { accessToken: "t" })).resolves.toEqual({});
  });

  it("defaults to the global fetch when none injected", () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}));
    const client = new MetaGraphClient();
    expect(client).toBeInstanceOf(MetaGraphClient);
    spy.mockRestore();
  });

  it("isTransientMetaError is false for non-Meta errors", () => {
    expect(isTransientMetaError(new Error("x"))).toBe(false);
    expect(
      isTransientMetaError(new MetaGraphError("x", { httpStatus: 400, transient: false }))
    ).toBe(false);
  });
});
