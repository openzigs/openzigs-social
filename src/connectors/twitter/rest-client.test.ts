import { describe, expect, it, vi } from "vitest";

import {
  TwitterApiError,
  TwitterRestClient,
  TWITTER_API_BASE_URL,
  isTransientTwitterError,
  type FetchLike
} from "./rest-client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("TwitterRestClient", () => {
  it("issues an authenticated GET with query params against the base URL", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ data: { id: "1" } }));
    const client = new TwitterRestClient({ fetchImpl });

    const out = await client.get<{ data: { id: string } }>("/tweets/1", {
      accessToken: "tok",
      query: { "tweet.fields": "public_metrics" }
    });

    expect(out.data.id).toBe("1");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${TWITTER_API_BASE_URL}/tweets/1?tweet.fields=public_metrics`);
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("serialises a JSON body on POST and keeps the token out of the URL", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ data: { id: "9" } }));
    const client = new TwitterRestClient({ fetchImpl });

    await client.post("/tweets", { accessToken: "secret-token", body: { text: "hi" } });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).not.toContain("secret-token");
    expect(init?.body).toBe(JSON.stringify({ text: "hi" }));
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("parses the v2 error envelope into a typed TwitterApiError", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ detail: "Too Many Requests", type: "about:blank" }, 429)
    );
    const client = new TwitterRestClient({ fetchImpl });

    await expect(client.get("/x", { accessToken: "t" })).rejects.toMatchObject({
      name: "TwitterApiError",
      httpStatus: 429,
      transient: true,
      message: "Too Many Requests"
    });
  });

  it("classifies 4xx (non-429) as non-transient", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ title: "Bad" }, 400));
    const client = new TwitterRestClient({ fetchImpl });
    await expect(client.get("/x", { accessToken: "t" })).rejects.toMatchObject({
      transient: false
    });
  });

  it("rejects an SSRF-unsafe base URL at construction", () => {
    expect(() => new TwitterRestClient({ baseUrl: "http://127.0.0.1/2" })).toThrow();
    expect(() => new TwitterRestClient({ baseUrl: "http://localhost/2" })).toThrow();
  });
});

describe("isTransientTwitterError", () => {
  it("is true only for transient TwitterApiError", () => {
    expect(
      isTransientTwitterError(new TwitterApiError("x", { httpStatus: 500, transient: true }))
    ).toBe(true);
    expect(
      isTransientTwitterError(new TwitterApiError("x", { httpStatus: 400, transient: false }))
    ).toBe(false);
    expect(isTransientTwitterError(new Error("plain"))).toBe(false);
  });
});
