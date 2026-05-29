import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchConnections } from "./connections";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchConnections", () => {
  it("returns the connections array on success", async () => {
    const payload = {
      timestamp: "2025-01-01T00:00:00.000Z",
      connections: [
        { platform: "instagram", label: "Instagram", connected: true, needsReconsent: false }
      ]
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
    );
    const result = await fetchConnections();
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe("instagram");
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 }))
    );
    await expect(fetchConnections()).rejects.toThrow(/HTTP 500/);
  });
});
