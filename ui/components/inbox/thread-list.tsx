"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { InboxThreadSummary } from "@/lib/inbox";
import { PlatformBadge } from "./platform-badge";

export interface ThreadListProps {
  threads: InboxThreadSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading?: boolean;
  error?: string;
}

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low"
};

function PriorityTag({ priority }: { priority: string }) {
  if (priority === "normal" || priority === "low") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        priority === "urgent"
          ? "bg-destructive/15 text-destructive"
          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
      )}
    >
      {PRIORITY_LABEL[priority] ?? priority}
    </span>
  );
}

/**
 * The unified, cross-platform thread list (#76). Threads arrive pre-sorted by
 * rule-derived priority then recency; each row shows the platform badge, the
 * author, a preview, an unread count, and a priority tag.
 */
export function ThreadList({ threads, selectedId, onSelect, loading, error }: ThreadListProps) {
  if (loading) {
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        Loading conversations…
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (threads.length === 0) {
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        No conversations match your filters.
      </p>
    );
  }

  return (
    <ul aria-label="Conversations" className="divide-y divide-border">
      {threads.map((thread) => {
        const name =
          thread.contact?.displayName ?? thread.contact?.handle ?? thread.subject ?? "Conversation";
        const selected = thread.id === selectedId;
        return (
          <li key={thread.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(thread.id)}
              className={cn(
                "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                selected && "bg-muted"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <PlatformBadge platform={thread.platform} />
                  <span className="truncate text-sm font-medium">{name}</span>
                </span>
                {thread.unreadCount > 0 && (
                  <span
                    aria-label={`${thread.unreadCount} unread`}
                    className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground"
                  >
                    {thread.unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <PriorityTag priority={thread.priority} />
                {thread.lastMessagePreview && (
                  <span className="truncate text-xs text-muted-foreground">
                    {thread.lastMessagePreview}
                  </span>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
