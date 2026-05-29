"use client";

import * as React from "react";

import { fetchConnections, type ConnectionSummary } from "@/lib/connections";
import { TikTokNotice } from "@/components/setup/tiktok-notice";

export interface PublishTargetsProps {
  /** Reports the set of selected, connected platform keys to the parent. */
  onSelectionChange?: (selected: string[]) => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; connections: ConnectionSummary[] };

/**
 * Per-account publish-target picker for the composer (epic #53).
 *
 * Reads `GET /api/connections` and renders a checkbox per connected social
 * account (Instagram / Facebook Pages / Threads / LinkedIn / Pinterest /
 * TikTok). Disconnected accounts are shown disabled with a hint so the user
 * knows to connect them first.
 */
export function PublishTargets({ onSelectionChange }: PublishTargetsProps) {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const controller = new AbortController();
    fetchConnections(controller.signal)
      .then((connections) => setState({ kind: "ready", connections }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not load connections"
        });
      });
    return () => controller.abort();
  }, []);

  function toggle(platform: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      onSelectionChange?.([...next]);
      return next;
    });
  }

  if (state.kind === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading accounts…
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.message}
      </p>
    );
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Publish to</legend>
      {state.connections.map((conn) => {
        const inputId = `publish-target-${conn.platform}`;
        return (
          <div key={conn.platform} className="flex items-center gap-2">
            <input
              id={inputId}
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!conn.connected}
              checked={selected.has(conn.platform)}
              onChange={() => {
                if (conn.connected) toggle(conn.platform);
              }}
            />
            <label
              htmlFor={inputId}
              className="text-sm data-[disabled=true]:text-muted-foreground"
              data-disabled={!conn.connected}
            >
              {conn.label}
              {!conn.connected && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {conn.needsReconsent ? "(reconnect required)" : "(not connected)"}
                </span>
              )}
            </label>
          </div>
        );
      })}
      {selected.has("tiktok") && <TikTokNotice />}
    </fieldset>
  );
}
