import { describe, expect, it, vi } from "vitest";

import {
  isTransientTikTokError,
  TikTokApiError,
  TikTokRestClient,
  TIKTOK_API_BASE_URL,
  type FetchLike
} from "./rest-client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("TikTokRestClient", () => {
  it("attaches a bearer token and unwraps the data envelope", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(200, { data: { publish_id: "p1" }, error: { code: "ok" } })
    );
    const client = new TikTokRestClient({ fetchImpl });

    const result = await client.post<{ publish_id: string }>("/post/publish/video/init/", {
      accessToken: "tok",
      body: {}
    });

    expect(result.publish_id).toBe("p1");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${TIKTOK_API_BASE_URL}/post/publish/video/init/`);
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("treats a non-ok business code as an error even on HTTP 200", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(200, { error: { code: "access_token_invalid", message: "bad token" } })
    );
    const client = new TikTokRestClient({ fetchImpl });

    await expect(client.get("/user/info/", { accessToken: "t" })).rejects.toMatchObject({
      name: "TikTokApiError",
      code: "access_token_invalid",
      transient: false
    });
  });

  it("flags transient business codes as retryable", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(200, { error: { code: "rate_limit_exceeded", message: "slow down" } })
    );
    const client = new TikTokRestClient({ fetchImpl });
    const err = await client.get("/user/info/", { accessToken: "t" }).catch((e) => e);
    expect(isTransientTikTokError(err)).toBe(true);
  });

  it("maps a 5xx HTTP failure to a transient error", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(503, {}));
    const client = new TikTokRestClient({ fetchImpl });
    const err = await client.get("/user/info/", { accessToken: "t" }).catch((e) => e);
    expect(isTransientTikTokError(err)).toBe(true);
  });

  it("rejects an SSRF-unsafe base URL", () => {
    expect(() => new TikTokRestClient({ baseUrl: "http://127.0.0.1/v2" })).toThrow();
  });

  it("isTransientTikTokError is false for non-TikTok errors", () => {
    expect(isTransientTikTokError(new Error("x"))).toBe(false);
    expect(
      isTransientTikTokError(new TikTokApiError("x", { httpStatus: 400, transient: false }))
    ).toBe(false);
  });

  it("appends defined query params and skips null/undefined", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(200, { data: { user: {} }, error: { code: "ok" } })
    );
    const client = new TikTokRestClient({ fetchImpl });

    await client.get("/user/info/", {
      accessToken: "t",
      query: { fields: "open_id", limit: 5, cursor: undefined, prev: null }
    });

    const url = fetchImpl.mock.calls[0]![0];
    expect(url).toContain("fields=open_id");
    expect(url).toContain("limit=5");
    expect(url).not.toContain("cursor");
    expect(url).not.toContain("prev");
  });

  it("returns an empty object when the success envelope omits data", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, { error: { code: "ok" } }));
    const client = new TikTokRestClient({ fetchImpl });
    await expect(client.get("/user/info/", { accessToken: "t" })).resolves.toEqual({});
  });

  it("tolerates a non-JSON / empty body on success", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response("", { status: 200 }));
    const client = new TikTokRestClient({ fetchImpl });
    await expect(client.get("/user/info/", { accessToken: "t" })).resolves.toEqual({});
  });

  it("normalizes a path without a leading slash", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(200, { data: {}, error: { code: "ok" } })
    );
    const client = new TikTokRestClient({ fetchImpl });
    await client.get("user/info/", { accessToken: "t" });
    expect(fetchImpl.mock.calls[0]![0]).toBe(`${TIKTOK_API_BASE_URL}/user/info/`);
  });
});
