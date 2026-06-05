"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { getYouTubeQuota, type YouTubeQuotaInfo } from "@/lib/youtube";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; quota: YouTubeQuotaInfo };

function barClass(pct: number): string {
  if (pct >= 80) return "bg-destructive";
  if (pct >= 60) return "bg-amber-500";
  return "bg-primary";
}

export interface YouTubeQuotaWidgetProps {
  className?: string;
}

/**
 * YouTube Data API v3 daily quota widget (epic #58).
 *
 * Displays "YouTube quota today: X / 10,000 units" with an accessible
 * progress bar. Turns amber at ≥60%, red at ≥80%.
 */
export function YouTubeQuotaWidget({ className }: YouTubeQuotaWidgetProps) {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });

  React.useEffect(() => {
    const controller = new AbortController();
    getYouTubeQuota(controller.signal)
      .then((quota) => setState({ kind: "ready", quota }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not load YouTube quota"
        });
      });
    return () => controller.abort();
  }, []);

  if (state.kind === "loading") {
    return (
      <div className={cn("rounded-md border p-3", className)} data-testid="yt-quota-widget">
        <p role="status" className="text-xs text-muted-foreground">
          Loading YouTube quota…
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={cn("rounded-md border p-3", className)} data-testid="yt-quota-widget">
        <p role="alert" className="text-xs text-destructive">
          {state.message}
        </p>
      </div>
    );
  }

  const { quota } = state;

  return (
    <div className={cn("rounded-md border p-3", className)} data-testid="yt-quota-widget">
      <p className="text-xs font-medium text-foreground">
        YouTube quota today:{" "}
        <span className="tabular-nums">
          {quota.used.toLocaleString()} / {quota.limit.toLocaleString()}
        </span>{" "}
        units
      </p>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={quota.pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="YouTube daily quota used"
      >
        <div
          className={cn("h-full rounded-full transition-all", barClass(quota.pct))}
          style={{ width: `${quota.pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {quota.pct}% used · {quota.day_utc}
      </p>
    </div>
  );
}
