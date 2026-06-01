import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dayLabel,
  fetchEngagementSeries,
  fetchHeatmap,
  fetchSummary,
  fetchTopPosts,
  formatCompact,
  pivotEngagement,
  type EngagementPoint
} from "./analytics";

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

describe("fetchSummary", () => {
  it("builds the window/platform query and returns the body", async () => {
    const fetchMock = mockFetch(() =>
      json({ window: 30, totals: { engagement: 5 }, perPlatform: [] })
    );
    const result = await fetchSummary(30, "instagram");
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/api/analytics/summary?");
    expect(url).toContain("window=30");
    expect(url).toContain("platform=instagram");
    expect(result.totals.engagement).toBe(5);
  });

  it("omits an undefined platform from the query", async () => {
    const fetchMock = mockFetch(() => json({ window: 7, totals: {}, perPlatform: [] }));
    await fetchSummary(7);
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain("platform=");
  });

  it("throws the server error message on a non-ok response", async () => {
    mockFetch(() => json({ error: "nope" }, false, 422));
    await expect(fetchSummary(30)).rejects.toThrow("nope");
  });

  it("falls back to a generic error when none is provided", async () => {
    mockFetch(() => json({}, false, 500));
    await expect(fetchSummary(30)).rejects.toThrow(/HTTP 500/);
  });
});

describe("the other fetchers unwrap their envelopes", () => {
  it("fetchEngagementSeries returns the series array", async () => {
    const fetchMock = mockFetch(() =>
      json({ series: [{ platform: "instagram", capturedFor: "2026-06-15", engagement: 9 }] })
    );
    const series = await fetchEngagementSeries(30, undefined, 14);
    expect(series).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("days=14");
  });

  it("fetchHeatmap defaults missing buckets/matrix to empty arrays", async () => {
    mockFetch(() => json({}));
    expect(await fetchHeatmap()).toEqual({ buckets: [], matrix: [] });
  });

  it("fetchTopPosts returns the posts array", async () => {
    mockFetch(() => json({ posts: [{ externalId: "p1", rank: 1 }] }));
    const posts = await fetchTopPosts(30, "instagram", 5);
    expect(posts[0]!.externalId).toBe("p1");
  });

  it("propagates a non-ok heatmap response", async () => {
    mockFetch(() => json({ error: "bad" }, false, 422));
    await expect(fetchHeatmap()).rejects.toThrow("bad");
  });
});

describe("dayLabel", () => {
  it("maps day-of-week indices to short labels", () => {
    expect(dayLabel(0)).toBe("Sun");
    expect(dayLabel(6)).toBe("Sat");
    expect(dayLabel(9)).toBe("9");
  });
});

describe("formatCompact", () => {
  it("compacts thousands and millions", () => {
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(1200)).toBe("1.2K");
    expect(formatCompact(3_400_000)).toBe("3.4M");
  });

  it("guards against non-finite input", () => {
    expect(formatCompact(Number.NaN)).toBe("0");
  });
});

describe("pivotEngagement", () => {
  it("pivots a flat series into per-day rows keyed by platform", () => {
    const points: EngagementPoint[] = [
      { platform: "linkedin", capturedFor: "2026-06-14", engagement: 3 },
      { platform: "instagram", capturedFor: "2026-06-14", engagement: 5 },
      { platform: "instagram", capturedFor: "2026-06-15", engagement: 8 }
    ];
    const { rows, platforms } = pivotEngagement(points);
    expect(platforms).toEqual(["instagram", "linkedin"]);
    expect(rows).toEqual([
      { capturedFor: "2026-06-14", instagram: 5, linkedin: 3 },
      { capturedFor: "2026-06-15", instagram: 8 }
    ]);
  });

  it("returns empty structures for no points", () => {
    expect(pivotEngagement([])).toEqual({ rows: [], platforms: [] });
  });
});
