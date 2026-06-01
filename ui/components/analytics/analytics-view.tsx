"use client";

import * as React from "react";
import { BarChart3, Eye, MessageSquare, Users } from "lucide-react";

import { useSocket } from "@/app/providers";
import { KpiCard } from "@/components/kpi-card";
import {
  ANALYTICS_WINDOWS,
  formatCompact,
  useAnalyticsSummary,
  useEngagementSeries,
  useHeatmap,
  useTopPosts,
  type AnalyticsWindow
} from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { EngagementChart } from "./engagement-chart";
import { HeatmapGrid } from "./heatmap-grid";
import { PlatformFilter } from "./platform-filter";
import { TopPostsList } from "./top-posts-list";

const WINDOW_LABELS: Record<AnalyticsWindow, string> = {
  7: "7 days",
  30: "30 days",
  90: "90 days"
};

/**
 * Analytics dashboard shell (epic #95). Composes the KPI row, engagement chart,
 * posting-time heatmap, and top-posts leaderboard behind a shared window +
 * platform filter. Each panel is fed by its own React Query hook (live on the
 * `analytics:updated` socket event); the platform filter passes the selection
 * straight to the hooks so a narrowed view is served from the rolled-up cache.
 */
export function AnalyticsView() {
  const socket = useSocket();
  const [window, setWindow] = React.useState<AnalyticsWindow>(30);
  const [platform, setPlatform] = React.useState<string | undefined>(undefined);

  const summary = useAnalyticsSummary(window, platform, socket);
  const engagement = useEngagementSeries(window, platform, socket);
  const heatmap = useHeatmap(platform, socket);
  const topPosts = useTopPosts(window, platform, socket);

  // Platform options come from the unfiltered summary so the pills stay stable
  // when a single platform is selected.
  const summaryAll = useAnalyticsSummary(window, undefined, socket);
  const platforms = (summaryAll.data?.perPlatform ?? []).map((p) => p.platform);

  const totals = summary.data?.totals;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Engagement, top posts, and posting times across your connected platforms.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PlatformFilter platforms={platforms} selected={platform} onSelect={setPlatform} />
          <div className="flex gap-1" role="group" aria-label="Select time window">
            {ANALYTICS_WINDOWS.map((w) => {
              const active = w === window;
              return (
                <button
                  key={w}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setWindow(w)}
                  className={cn(
                    "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {WINDOW_LABELS[w]}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {summary.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {(summary.error as Error)?.message ?? "Failed to load analytics."}
        </p>
      ) : null}

      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Key metrics"
      >
        <KpiCard
          title="Engagement"
          value={formatCompact(totals?.engagement ?? 0)}
          hint={`Last ${WINDOW_LABELS[window]}`}
          icon={MessageSquare}
        />
        <KpiCard
          title="Posts"
          value={formatCompact(totals?.posts ?? 0)}
          hint={`Avg ${formatCompact(totals?.avgEngagementPerPost ?? 0)} per post`}
          icon={BarChart3}
        />
        <KpiCard
          title="Impressions"
          value={formatCompact(totals?.impressions ?? 0)}
          hint={`Last ${WINDOW_LABELS[window]}`}
          icon={Eye}
        />
        <KpiCard
          title="Followers"
          value={formatCompact(totals?.followers ?? 0)}
          hint="Current total"
          icon={Users}
        />
      </section>

      <EngagementChart points={engagement.data ?? []} loading={engagement.isLoading} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HeatmapGrid data={heatmap.data} loading={heatmap.isLoading} />
        <TopPostsList posts={topPosts.data ?? []} loading={topPosts.isLoading} />
      </div>
    </div>
  );
}
