"use client";

import * as React from "react";
import type { Socket } from "socket.io-client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fetchTwitterQuota,
  type TwitterQuotaEvent,
  type TwitterQuotaSummary
} from "@/lib/twitter-quota";

export interface TwitterQuotaPanelProps {
  /** Live socket to subscribe to `twitter:quota` push updates. */
  socket?: Socket | null;
  className?: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; tier: string; summary: TwitterQuotaSummary };

function pct(ratio: number): number {
  return Math.min(100, Math.round(ratio * 100));
}

function barClass(ratio: number): string {
  if (ratio >= 1) return "bg-destructive";
  if (ratio >= 0.8) return "bg-amber-500";
  return "bg-primary";
}

/**
 * Model-panel widget showing month-to-date X (Twitter) write-quota usage
 * (epic #66, sub #69/#70).
 *
 * Loads the current usage from `GET /api/twitter/quota` and live-updates from
 * the `twitter:quota` socket event when the write-quota guard crosses the warn
 * (80%) or exhaustion (100%) thresholds.
 */
export function TwitterQuotaPanel({ socket, className }: TwitterQuotaPanelProps) {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });

  React.useEffect(() => {
    const controller = new AbortController();
    fetchTwitterQuota(controller.signal)
      .then((res) => setState({ kind: "ready", tier: res.tier, summary: res.quota }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not load X quota"
        });
      });
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    if (!socket) return;
    const onQuota = (event: TwitterQuotaEvent): void => {
      if (!event?.summary) return;
      setState((prev) => ({
        kind: "ready",
        tier: prev.kind === "ready" ? prev.tier : "free",
        summary: event.summary
      }));
    };
    socket.on("twitter:quota", onQuota);
    return () => {
      socket.off("twitter:quota", onQuota);
    };
  }, [socket]);

  if (state.kind === "loading") {
    return (
      <Card className={cn("", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">X write quota</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === "error") {
    return (
      <Card className={cn("", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">X write quota</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { summary, tier } = state;
  const percent = pct(summary.ratio);

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">X write quota</CardTitle>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{tier}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">
          {summary.used.toLocaleString()}
          <span className="text-base font-normal text-muted-foreground">
            {" / "}
            {summary.cap.toLocaleString()}
          </span>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="X write quota used"
        >
          <div
            className={cn("h-full rounded-full transition-all", barClass(summary.ratio))}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {summary.remaining.toLocaleString()} remaining this month ({summary.month})
        </p>
      </CardContent>
    </Card>
  );
}
