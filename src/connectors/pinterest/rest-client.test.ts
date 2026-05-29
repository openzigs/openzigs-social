import { describe, expect, it, vi } from "vitest";

import {
  isTransientPinterestError,
  PinterestApiError,
  PinterestRestClient,
  PINTEREST_API_BASE_URL,
  type FetchLike
} from "./rest-client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("PinterestRestClient", () => {
  it("attaches a bearer token on GET", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, {}));
    const client = new PinterestRestClient({ fetchImpl });

    await client.get("/pins/1/analytics", { accessToken: "tok" });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${PINTEREST_API_BASE_URL}/pins/1/analytics`);
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("serialises a JSON body on POST", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(201, { id: "pin-1" }));
    const client = new PinterestRestClient({ fetchImpl });

    const result = await client.post<{ id: string }>("/pins", {
      accessToken: "t",
      body: { board_id: "b1" }
    });

    expect(result.id).toBe("pin-1");
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string)).toEqual({ board_id: "b1" });
  });

  it("maps a 4xx envelope to a non-transient error", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(403, { code: 7, message: "no" }));
    const client = new PinterestRestClient({ fetchImpl });

    await expect(client.get("/pins/1/analytics", { accessToken: "t" })).rejects.toMatchObject({
      name: "PinterestApiError",
      httpStatus: 403,
      code: 7,
      transient: false
    });
  });

  it("flags 429 and 5xx as transient", async () => {
    for (const status of [429, 500]) {
      const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(status, {}));
      const client = new PinterestRestClient({ fetchImpl });
      const err = await client.get("/x", { accessToken: "t" }).catch((e) => e);
      expect(isTransientPinterestError(err)).toBe(true);
    }
  });

  it("rejects an SSRF-unsafe base URL", () => {
    expect(() => new PinterestRestClient({ baseUrl: "http://localhost/v5" })).toThrow();
  });

  it("isTransientPinterestError is false for other errors", () => {
    expect(isTransientPinterestError(new Error("x"))).toBe(false);
    expect(
      isTransientPinterestError(new PinterestApiError("x", { httpStatus: 400, transient: false }))
    ).toBe(false);
  });
});
