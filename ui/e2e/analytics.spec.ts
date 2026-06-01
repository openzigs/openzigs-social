import { expect, test } from "@playwright/test";

import type { AnalyticsSummary, EngagementPoint, HeatmapResponse, TopPost } from "@/lib/analytics";

import { AnalyticsPage, type AnalyticsStubData } from "./pages/analytics.page";

function summary(
  window: 7 | 30 | 90,
  totals: AnalyticsSummary["totals"],
  perPlatform: AnalyticsSummary["perPlatform"]
): AnalyticsSummary {
  return { window, totals, perPlatform };
}

function series(points: EngagementPoint[]): { series: EngagementPoint[] } {
  return { series: points };
}

function matrix(overrides: Record<string, number>): number[][] {
  const data = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const [slot, value] of Object.entries(overrides)) {
    const [day, hour] = slot.split(":").map(Number);
    data[day]![hour!] = value;
  }
  return data;
}

function heatmap(value: Record<string, number>): HeatmapResponse {
  return { buckets: [], matrix: matrix(value) };
}

function topPosts(posts: TopPost[]): { posts: TopPost[] } {
  return { posts };
}

function analyticsFixtures(): AnalyticsStubData {
  return {
    summaries: {
      "30:all": summary(
        30,
        {
          engagement: 1200,
          posts: 8,
          impressions: 3400000,
          followers: 500,
          avgEngagementPerPost: 150
        },
        [
          { platform: "instagram", engagement: 1000, posts: 5, impressions: 2000000, followers: 300 },
          { platform: "linkedin", engagement: 200, posts: 3, impressions: 1400000, followers: 200 }
        ]
      ),
      "30:instagram": summary(
        30,
        {
          engagement: 1000,
          posts: 5,
          impressions: 2000000,
          followers: 300,
          avgEngagementPerPost: 200
        },
        [{ platform: "instagram", engagement: 1000, posts: 5, impressions: 2000000, followers: 300 }]
      ),
      "30:linkedin": summary(
        30,
        {
          engagement: 200,
          posts: 3,
          impressions: 1400000,
          followers: 200,
          avgEngagementPerPost: 67
        },
        [{ platform: "linkedin", engagement: 200, posts: 3, impressions: 1400000, followers: 200 }]
      ),
      "7:all": summary(
        7,
        {
          engagement: 222,
          posts: 3,
          impressions: 870000,
          followers: 500,
          avgEngagementPerPost: 74
        },
        [
          { platform: "instagram", engagement: 180, posts: 2, impressions: 600000, followers: 300 },
          { platform: "linkedin", engagement: 42, posts: 1, impressions: 270000, followers: 200 }
        ]
      ),
      "7:instagram": summary(
        7,
        {
          engagement: 180,
          posts: 2,
          impressions: 600000,
          followers: 300,
          avgEngagementPerPost: 90
        },
        [{ platform: "instagram", engagement: 180, posts: 2, impressions: 600000, followers: 300 }]
      ),
      "7:linkedin": summary(
        7,
        {
          engagement: 42,
          posts: 1,
          impressions: 270000,
          followers: 200,
          avgEngagementPerPost: 42
        },
        [{ platform: "linkedin", engagement: 42, posts: 1, impressions: 270000, followers: 200 }]
      )
    },
    engagement: {
      "30:all": series([
        { platform: "instagram", capturedFor: "2026-05-29", engagement: 4 },
        { platform: "linkedin", capturedFor: "2026-05-29", engagement: 2 },
        { platform: "instagram", capturedFor: "2026-05-30", engagement: 7 },
        { platform: "linkedin", capturedFor: "2026-05-30", engagement: 3 }
      ]),
      "30:instagram": series([
        { platform: "instagram", capturedFor: "2026-05-29", engagement: 4 },
        { platform: "instagram", capturedFor: "2026-05-30", engagement: 7 }
      ]),
      "30:linkedin": series([
        { platform: "linkedin", capturedFor: "2026-05-29", engagement: 2 },
        { platform: "linkedin", capturedFor: "2026-05-30", engagement: 3 }
      ]),
      "7:all": series([
        { platform: "instagram", capturedFor: "2026-05-31", engagement: 1 },
        { platform: "linkedin", capturedFor: "2026-05-31", engagement: 1 },
        { platform: "instagram", capturedFor: "2026-06-01", engagement: 2 },
        { platform: "linkedin", capturedFor: "2026-06-01", engagement: 1 }
      ]),
      "7:instagram": series([
        { platform: "instagram", capturedFor: "2026-05-31", engagement: 1 },
        { platform: "instagram", capturedFor: "2026-06-01", engagement: 2 }
      ]),
      "7:linkedin": series([
        { platform: "linkedin", capturedFor: "2026-05-31", engagement: 1 },
        { platform: "linkedin", capturedFor: "2026-06-01", engagement: 1 }
      ])
    },
    heatmaps: {
      all: heatmap({ "1:12": 4, "4:9": 2, "5:18": 3 }),
      instagram: heatmap({ "1:12": 4, "4:9": 1 }),
      linkedin: heatmap({ "4:9": 2, "5:18": 3 })
    },
    topPosts: {
      "30:all": topPosts([
        { platform: "instagram", externalId: "ig-1", engagement: 1250, publishedAt: 1748476800000, rank: 1 },
        { platform: "instagram", externalId: "ig-2", engagement: 900, publishedAt: null, rank: 2 },
        { platform: "linkedin", externalId: "li-1", engagement: 300, publishedAt: 1748476800000, rank: 1 },
        { platform: "linkedin", externalId: "li-2", engagement: 140, publishedAt: null, rank: 2 }
      ]),
      "30:instagram": topPosts([
        { platform: "instagram", externalId: "ig-1", engagement: 1250, publishedAt: 1748476800000, rank: 1 },
        { platform: "instagram", externalId: "ig-2", engagement: 900, publishedAt: null, rank: 2 }
      ]),
      "30:linkedin": topPosts([
        { platform: "linkedin", externalId: "li-1", engagement: 300, publishedAt: 1748476800000, rank: 1 },
        { platform: "linkedin", externalId: "li-2", engagement: 140, publishedAt: null, rank: 2 }
      ]),
      "7:all": topPosts([
        { platform: "instagram", externalId: "ig-7", engagement: 42, publishedAt: 1748736000000, rank: 1 },
        { platform: "linkedin", externalId: "li-7", engagement: 11, publishedAt: null, rank: 1 }
      ]),
      "7:instagram": topPosts([
        { platform: "instagram", externalId: "ig-7", engagement: 42, publishedAt: 1748736000000, rank: 1 }
      ]),
      "7:linkedin": topPosts([
        { platform: "linkedin", externalId: "li-7", engagement: 11, publishedAt: null, rank: 1 }
      ])
    }
  };
}

test.describe("Analytics dashboard (#95)", () => {
  let analytics: AnalyticsPage;

  test.beforeEach(async ({ page }) => {
    analytics = new AnalyticsPage(page);
    await analytics.stubDashboard(analyticsFixtures());
  });

  // AC 1: The analytics page loads and renders KPI cards, the engagement chart,
  // the heatmap, and the top-posts list from cached data.
  test("loads the dashboard shell and renders the cached analytics panels", async () => {
    await analytics.goto();

    await expect(analytics.heading).toBeVisible();
    await expect(analytics.windowButton(30)).toHaveAttribute("aria-pressed", "true");
    await expect(analytics.platformButton("All platforms")).toHaveAttribute("aria-pressed", "true");

    await expect(analytics.keyMetrics).toContainText("1.2K");
    await expect(analytics.keyMetrics).toContainText("8");
    await expect(analytics.keyMetrics).toContainText("3.4M");
    await expect(analytics.keyMetrics).toContainText("500");

    await expect(analytics.page.getByText("Engagement over time", { exact: true })).toBeVisible();
    await expect(analytics.engagementChart.getByText("Instagram", { exact: true })).toBeVisible();
    await expect(analytics.engagementChart.getByText("LinkedIn", { exact: true })).toBeVisible();
    await expect(analytics.engagementChart).toBeVisible();

    await expect(analytics.page.getByText("Posting-time heatmap", { exact: true })).toBeVisible();
    await expect(analytics.page.getByText("Top posts", { exact: true })).toBeVisible();
    await expect(analytics.topPostHeading("Instagram")).toBeVisible();
    await expect(analytics.topPostHeading("LinkedIn")).toBeVisible();
    await expect(analytics.topPostItem("ig-1")).toContainText("1.3K");
    await expect(analytics.topPostItem("li-1")).toContainText("300");
  });

  // AC 2: Switching the window (7/30/90) refetches/re-renders the dashboard for the selected window.
  test("switches the window and rerenders the dashboard for the selected range", async () => {
    await analytics.goto();

    await expect(analytics.keyMetrics).toContainText("1.2K");
    await analytics.windowButton(7).click();

    await expect(analytics.windowButton(7)).toHaveAttribute("aria-pressed", "true");
    await expect(analytics.keyMetrics).toContainText("222");
    await expect(analytics.keyMetrics).toContainText("Avg 74 per post");
    await expect(analytics.keyMetrics).toContainText("Last 7 days");
    await expect(analytics.topPostItem("ig-7")).toBeVisible();
    await expect(analytics.topPostItem("li-7")).toBeVisible();
  });

  // AC 3: Filtering by platform re-renders the dashboard scoped to that platform.
  test("filters the dashboard to a single platform", async () => {
    await analytics.goto();

    await expect(analytics.keyMetrics).toContainText("1.2K");
    await analytics.platformButton("LinkedIn").click();

    await expect(analytics.platformButton("LinkedIn")).toHaveAttribute("aria-pressed", "true");
    await expect(analytics.keyMetrics).toContainText("200");
    await expect(analytics.keyMetrics).toContainText("Avg 67 per post");
    await expect(analytics.topPostHeading("LinkedIn")).toBeVisible();
    await expect(analytics.topPostHeading("Instagram")).toHaveCount(0);
    await expect(analytics.page.getByText("li-1")).toBeVisible();
    await expect(analytics.page.getByText("ig-1")).toHaveCount(0);
  });

  // AC 4: The posting-time heatmap renders a 7×24 grid (day-of-week × hour-of-day).
  test("renders the posting-time heatmap as a 7x24 grid", async () => {
    await analytics.goto();

    await expect(analytics.heatmapGrid).toBeVisible();
    await expect(analytics.page.getByRole("rowheader")).toHaveCount(7);
    await expect(analytics.page.getByRole("columnheader")).toHaveCount(24);
    await expect(analytics.page.getByLabel("Mon 12:00, 4 posts")).toBeVisible();
    await expect(analytics.page.getByLabel("Thu 9:00, 2 posts")).toBeVisible();
    await expect(analytics.page.getByLabel("Fri 18:00, 3 posts")).toBeVisible();
  });

  // AC 5: The top-posts list shows the top posts with their engagement.
  test("shows the ranked top posts and their engagement totals", async () => {
    await analytics.goto();

    await expect(analytics.topPostHeading("Instagram")).toBeVisible();
    await expect(analytics.topPostHeading("LinkedIn")).toBeVisible();
    await expect(analytics.topPostItem("ig-1")).toContainText("#1");
    await expect(analytics.topPostItem("ig-1")).toContainText("1.3K");
    await expect(analytics.topPostItem("ig-2")).toContainText("#2");
    await expect(analytics.topPostItem("ig-2")).toContainText("900");
    await expect(analytics.topPostItem("li-1")).toContainText("#1");
    await expect(analytics.topPostItem("li-1")).toContainText("300");
  });
});