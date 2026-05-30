import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchTwitterQuota } from "./twitter-quota";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchTwitterQuota", () => {
  it("returns the quota envelope on success", async () => {
    const payload = {
      timestamp: "2026-05-01T00:00:00.000Z",
      tier: "basic",
      quota: { month: "2026-05", used: 250, cap: 1000, remaining: 750, ratio: 0.25 }
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
    );
    const result = await fetchTwitterQuota();
    expect(result.tier).toBe("basic");
    expect(result.quota.used).toBe(250);
    expect(result.quota.ratio).toBeCloseTo(0.25);
  });

  it("forwards an abort signal to fetch", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    const controller = new AbortController();
    await fetchTwitterQuota(controller.signal);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("/api/twitter/quota"), {
      signal: controller.signal
    });
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 }))
    );
    await expect(fetchTwitterQuota()).rejects.toThrow(/HTTP 503/);
  });
});
