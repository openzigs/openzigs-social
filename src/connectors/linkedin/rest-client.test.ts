import { describe, expect, it, vi } from "vitest";

import {
  isTransientLinkedInError,
  LinkedInApiError,
  LinkedInRestClient,
  LINKEDIN_API_VERSION,
  LINKEDIN_REST_BASE_URL,
  type FetchLike
} from "./rest-client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("LinkedInRestClient", () => {
  it("attaches versioned headers and bearer token on GET", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, { elements: [] }));
    const client = new LinkedInRestClient({ fetchImpl });

    await client.get("/socialActions/urn/comments", { accessToken: "tok-123" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${LINKEDIN_REST_BASE_URL}/socialActions/urn/comments`);
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-123");
    expect(headers["LinkedIn-Version"]).toBe(LINKEDIN_API_VERSION);
    expect(headers["X-Restli-Protocol-Version"]).toBe("2.0.0");
  });

  it("serialises a JSON body on POST and returns parsed json", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(201, { id: "urn:li:post:1" }));
    const client = new LinkedInRestClient({ fetchImpl });

    const result = await client.post<{ id: string }>("/posts", {
      accessToken: "t",
      body: { commentary: "hi" }
    });

    expect(result.id).toBe("urn:li:post:1");
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ commentary: "hi" });
  });

  it("appends query params, skipping null/undefined", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, {}));
    const client = new LinkedInRestClient({ fetchImpl });

    await client.get("/networkSizes/urn", {
      accessToken: "t",
      query: { edgeType: "COMPANY_FOLLOWED_BY_MEMBER", skip: undefined, none: null }
    });

    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("edgeType=COMPANY_FOLLOWED_BY_MEMBER");
    expect(url).not.toContain("skip=");
    expect(url).not.toContain("none=");
  });

  it("maps a 4xx error envelope to a non-transient LinkedInApiError", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(400, { message: "bad request", serviceErrorCode: 100, code: "BAD" })
    );
    const client = new LinkedInRestClient({ fetchImpl });

    await expect(client.get("/posts", { accessToken: "t" })).rejects.toMatchObject({
      name: "LinkedInApiError",
      httpStatus: 400,
      serviceErrorCode: 100,
      code: "BAD",
      transient: false
    });
  });

  it("flags 429 and 5xx as transient", async () => {
    for (const status of [429, 500, 503]) {
      const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(status, { message: "x" }));
      const client = new LinkedInRestClient({ fetchImpl });
      const err = await client.get("/posts", { accessToken: "t" }).catch((e) => e);
      expect(isTransientLinkedInError(err)).toBe(true);
    }
  });

  it("rejects an SSRF-unsafe base URL at construction", () => {
    expect(() => new LinkedInRestClient({ baseUrl: "http://127.0.0.1/rest" })).toThrow();
  });

  it("isTransientLinkedInError is false for non-LinkedIn errors", () => {
    expect(isTransientLinkedInError(new Error("nope"))).toBe(false);
    expect(
      isTransientLinkedInError(new LinkedInApiError("x", { httpStatus: 400, transient: false }))
    ).toBe(false);
  });
});
