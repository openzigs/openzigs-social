import type { Locator, Page, Route } from "@playwright/test";

import type {
  AnalyticsSummary,
  AnalyticsWindow,
  EngagementPoint,
  HeatmapResponse,
  TopPost
} from "@/lib/analytics";

export interface AnalyticsStubData {
  summaries: Record<string, AnalyticsSummary>;
  engagement: Record<string, { series: EngagementPoint[] }>;
  heatmaps: Record<string, HeatmapResponse>;
  topPosts: Record<string, { posts: TopPost[] }>;
}

function key(window: AnalyticsWindow, platform: string | undefined): string {
  return `${window}:${platform ?? "all"}`;
}

function parseWindow(url: URL): AnalyticsWindow {
  const value = Number(url.searchParams.get("window") ?? 30);
  return value === 7 || value === 30 || value === 90 ? value : 30;
}

function parsePlatform(url: URL): string | undefined {
  const platform = url.searchParams.get("platform");
  return platform && platform.length > 0 ? platform : undefined;
}

function readRecord<T>(record: Record<string, T>, lookupKey: string, label: string): T {
  const value = record[lookupKey] ?? record[label];
  if (value === undefined) {
    throw new Error(`Missing analytics stub for ${lookupKey}`);
  }
  return value;
}

/** Page Object for the analytics dashboard route (`/analytics`, epic #95). */
export class AnalyticsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly keyMetrics: Locator;
  readonly windowGroup: Locator;
  readonly platformGroup: Locator;
  readonly engagementChart: Locator;
  readonly heatmapGrid: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Analytics", level: 1 });
    this.keyMetrics = page.getByRole("region", { name: "Key metrics" });
    this.windowGroup = page.getByRole("group", { name: "Select time window" });
    this.platformGroup = page.getByRole("group", { name: "Filter by platform" });
    this.engagementChart = page.getByTestId("engagement-chart");
    this.heatmapGrid = page.getByTestId("heatmap-grid");
  }

  async goto(): Promise<void> {
    await this.page.goto("/analytics");
  }

  async stubDashboard(data: AnalyticsStubData): Promise<void> {
    await this.page.route(/\/api\/analytics\/summary(?:\?.*)?$/, (route: Route) => {
      const url = new URL(route.request().url());
      const lookupKey = key(parseWindow(url), parsePlatform(url));
      const summary = readRecord(data.summaries, lookupKey, "summary");
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) });
    });

    await this.page.route(/\/api\/analytics\/engagement(?:\?.*)?$/, (route: Route) => {
      const url = new URL(route.request().url());
      const lookupKey = key(parseWindow(url), parsePlatform(url));
      const response = readRecord(data.engagement, lookupKey, "engagement");
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
    });

    await this.page.route(/\/api\/analytics\/heatmap(?:\?.*)?$/, (route: Route) => {
      const url = new URL(route.request().url());
      const lookupKey = parsePlatform(url) ?? "all";
      const response = readRecord(data.heatmaps, lookupKey, "heatmap");
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
    });

    await this.page.route(/\/api\/analytics\/top-posts(?:\?.*)?$/, (route: Route) => {
      const url = new URL(route.request().url());
      const lookupKey = key(parseWindow(url), parsePlatform(url));
      const response = readRecord(data.topPosts, lookupKey, "top-posts");
      void route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
    });
  }

  windowButton(window: AnalyticsWindow): Locator {
    return this.windowGroup.getByRole("button", { name: `${window} days` });
  }

  platformButton(name: string): Locator {
    return this.platformGroup.getByRole("button", { name, exact: true });
  }

  metricValue(value: string): Locator {
    return this.keyMetrics.getByText(value, { exact: true });
  }

  topPostHeading(platform: string): Locator {
    return this.page.getByRole("heading", { name: platform, level: 3 });
  }

  topPostItem(externalId: string): Locator {
    return this.page.getByRole("listitem").filter({ hasText: externalId });
  }
}