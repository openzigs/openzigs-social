import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";

import { API_URL } from "./socket";

/** Trailing windows (days) the dashboard can request. */
export const ANALYTICS_WINDOWS = [7, 30, 90] as const;
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];

/** Normalised aggregate metric names (mirror of the server `RollupMetric`). */
export type RollupMetric = "engagement" | "posts" | "impressions" | "followers";

/** KPI totals across the selected platforms. */
export interface AnalyticsTotals {
  engagement: number;
  posts: number;
  impressions: number;
  followers: number;
  avgEngagementPerPost: number;
}

/** Per-platform metric breakdown row. */
export interface PlatformSummary {
  platform: string;
  engagement: number;
  posts: number;
  impressions: number;
  followers: number;
}

export interface AnalyticsSummary {
  window: AnalyticsWindow;
  totals: AnalyticsTotals;
  perPlatform: PlatformSummary[];
}

/** One engagement reading for a (platform, day). */
export interface EngagementPoint {
  platform: string;
  capturedFor: string;
  engagement: number;
}

/** One posting-time heatmap bucket. */
export interface HeatmapBucket {
  platform: string;
  dayOfWeek: number;
  hourOfDay: number;
  count: number;
}

export interface HeatmapResponse {
  buckets: HeatmapBucket[];
  /** Dense 7×24 matrix (rows = Sun..Sat, cols = hour 0..23). */
  matrix: number[][];
}

/** One ranked top post. */
export interface TopPost {
  platform: string;
  externalId: string;
  engagement: number;
  publishedAt: number | null;
  rank: number;
}

async function readError(res: Response, fallback: string): Promise<never> {
  const detail = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(detail.error ?? `${fallback} (HTTP ${res.status})`);
}

function withParams(path: string, params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  const s = qs.toString();
  return `${API_URL}/api/analytics/${path}${s ? `?${s}` : ""}`;
}

/** Fetch the KPI summary for a window (optionally a single platform). */
export async function fetchSummary(
  window: AnalyticsWindow,
  platform?: string,
  signal?: AbortSignal
): Promise<AnalyticsSummary> {
  const res = await fetch(withParams("summary", { window, platform }), { signal });
  if (!res.ok) await readError(res, "failed to load analytics summary");
  return (await res.json()) as AnalyticsSummary;
}

/** Fetch the engagement time series for a window (optionally a single platform). */
export async function fetchEngagementSeries(
  window: AnalyticsWindow,
  platform?: string,
  days?: number,
  signal?: AbortSignal
): Promise<EngagementPoint[]> {
  const res = await fetch(withParams("engagement", { window, platform, days }), { signal });
  if (!res.ok) await readError(res, "failed to load engagement series");
  return ((await res.json()) as { series: EngagementPoint[] }).series;
}

/** Fetch the posting-time heatmap (optionally a single platform). */
export async function fetchHeatmap(
  platform?: string,
  signal?: AbortSignal
): Promise<HeatmapResponse> {
  const res = await fetch(withParams("heatmap", { platform }), { signal });
  if (!res.ok) await readError(res, "failed to load heatmap");
  const body = (await res.json()) as HeatmapResponse;
  return { buckets: body.buckets ?? [], matrix: body.matrix ?? [] };
}

/** Fetch the top posts for a window (optionally a single platform). */
export async function fetchTopPosts(
  window: AnalyticsWindow,
  platform?: string,
  limit?: number,
  signal?: AbortSignal
): Promise<TopPost[]> {
  const res = await fetch(withParams("top-posts", { window, platform, limit }), { signal });
  if (!res.ok) await readError(res, "failed to load top posts");
  return ((await res.json()) as { posts: TopPost[] }).posts;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Human label for a day-of-week index (0 = Sunday). */
export function dayLabel(dayOfWeek: number): string {
  return DAY_LABELS[dayOfWeek] ?? String(dayOfWeek);
}

/** Compact number formatter (1.2K, 3.4M). */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

/** Row shape consumed by the recharts line chart. */
export interface EngagementChartRow {
  capturedFor: string;
  [platform: string]: string | number;
}

/**
 * Pivot a flat engagement series into per-day rows keyed by platform, ready for
 * a multi-series line chart. Also returns the distinct platform keys in stable
 * (alphabetical) order so the chart can map one `<Line>` per platform.
 */
export function pivotEngagement(points: EngagementPoint[]): {
  rows: EngagementChartRow[];
  platforms: string[];
} {
  const byDay = new Map<string, EngagementChartRow>();
  const platforms = new Set<string>();
  for (const p of points) {
    platforms.add(p.platform);
    const row = byDay.get(p.capturedFor) ?? { capturedFor: p.capturedFor };
    row[p.platform] = ((row[p.platform] as number | undefined) ?? 0) + p.engagement;
    byDay.set(p.capturedFor, row);
  }
  const rows = [...byDay.values()].sort((a, b) =>
    a.capturedFor < b.capturedFor ? -1 : a.capturedFor > b.capturedFor ? 1 : 0
  );
  return { rows, platforms: [...platforms].sort() };
}

/** The single socket event the aggregator emits after a roll-up. */
const ANALYTICS_EVENT = "analytics:updated";

/** Subscribe a query family to `analytics:updated` for live refresh. */
function useAnalyticsLiveRefresh(socket: Socket | null): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!socket) return;
    const invalidate = (): void => {
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    };
    socket.on(ANALYTICS_EVENT, invalidate);
    return () => {
      socket.off(ANALYTICS_EVENT, invalidate);
    };
  }, [socket, queryClient]);
}

/** React Query hook for the KPI summary, live on `analytics:updated`. */
export function useAnalyticsSummary(
  window: AnalyticsWindow,
  platform: string | undefined,
  socket: Socket | null
) {
  useAnalyticsLiveRefresh(socket);
  return useQuery({
    queryKey: ["analytics", "summary", window, platform ?? null],
    queryFn: ({ signal }) => fetchSummary(window, platform, signal)
  });
}

/** React Query hook for the engagement series, live on `analytics:updated`. */
export function useEngagementSeries(
  window: AnalyticsWindow,
  platform: string | undefined,
  socket: Socket | null,
  days?: number
) {
  useAnalyticsLiveRefresh(socket);
  return useQuery({
    queryKey: ["analytics", "engagement", window, platform ?? null, days ?? null],
    queryFn: ({ signal }) => fetchEngagementSeries(window, platform, days, signal)
  });
}

/** React Query hook for the heatmap, live on `analytics:updated`. */
export function useHeatmap(platform: string | undefined, socket: Socket | null) {
  useAnalyticsLiveRefresh(socket);
  return useQuery({
    queryKey: ["analytics", "heatmap", platform ?? null],
    queryFn: ({ signal }) => fetchHeatmap(platform, signal)
  });
}

/** React Query hook for the top posts, live on `analytics:updated`. */
export function useTopPosts(
  window: AnalyticsWindow,
  platform: string | undefined,
  socket: Socket | null,
  limit?: number
) {
  useAnalyticsLiveRefresh(socket);
  return useQuery({
    queryKey: ["analytics", "top-posts", window, platform ?? null, limit ?? null],
    queryFn: ({ signal }) => fetchTopPosts(window, platform, limit, signal)
  });
}
