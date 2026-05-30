"use client";

import * as React from "react";

import { useSocket } from "@/app/providers";
import { useToast } from "@/components/ui/use-toast";
import { postLimitsFor } from "@/lib/compose";
import {
  useDeletePost,
  useOutbox,
  useOutboxDlq,
  useRetryPost,
  type OutboxPost
} from "@/lib/outbox";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  publishing: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  published: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
};

function fmtTime(epoch?: number): string {
  return epoch ? new Date(epoch).toLocaleString() : "—";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

function PostRow({
  post,
  onRetry,
  onDelete,
  retrying
}: {
  post: OutboxPost;
  onRetry: (id: number) => void;
  onDelete: (id: number) => void;
  retrying: boolean;
}) {
  const label = postLimitsFor(post.platform).label;
  return (
    <li className="space-y-1 rounded-md border border-border p-3" data-testid={`post-${post.id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <StatusBadge status={post.status} />
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">{post.body || "(no text)"}</p>
      <p className="text-xs text-muted-foreground">
        {post.status === "published"
          ? `Published ${fmtTime(post.publishedAt)}`
          : `Scheduled ${fmtTime(post.publishAt)}`}
        {post.attempts > 0 && ` · ${post.attempts} attempt(s)`}
      </p>
      {post.status === "failed" && post.lastError && (
        <p role="alert" className="text-xs text-destructive">
          {post.lastError}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        {post.status === "failed" && (
          <button
            type="button"
            className="rounded-md border border-input px-2 py-1 text-xs font-medium disabled:opacity-50"
            disabled={retrying}
            onClick={() => onRetry(post.id)}
          >
            Retry
          </button>
        )}
        {post.status !== "published" && post.status !== "publishing" && (
          <button
            type="button"
            className="rounded-md border border-input px-2 py-1 text-xs font-medium text-destructive disabled:opacity-50"
            onClick={() => onDelete(post.id)}
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Outbox queue + dead-letter view (#89).
 *
 * Lists every outbox post with its status, and prominently surfaces failed
 * posts (with the `last_error` and attempt count) plus the dead-letter queue so
 * a publish that exhausted its 1m/5m/30m/2h retries is never silently lost. A
 * failed post can be requeued with one click (failed → scheduled).
 */
export function OutboxView() {
  const socket = useSocket();
  const { toast } = useToast();
  const retry = useRetryPost();
  const del = useDeletePost();
  const { data: posts = [], isLoading, isError, error } = useOutbox({}, socket);
  const { data: dlq = [] } = useOutboxDlq(socket);

  const failed = posts.filter((p) => p.status === "failed");
  const active = posts.filter((p) => p.status !== "failed");

  function handleRetry(id: number): void {
    retry.mutate(
      { id },
      {
        onSuccess: () => toast({ title: "Post requeued" }),
        onError: (err) =>
          toast({
            title: "Could not retry",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive"
          })
      }
    );
  }

  function handleDelete(id: number): void {
    del.mutate(id, {
      onError: (err) =>
        toast({
          title: "Could not delete",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive"
        })
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Outbox</h1>
        <p className="text-sm text-muted-foreground">
          Scheduled, publishing, and published posts — plus anything that failed.
        </p>
      </div>

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load the outbox."}
        </p>
      )}

      {failed.length > 0 && (
        <section className="space-y-2" aria-labelledby="failed-heading">
          <h2 id="failed-heading" className="text-sm font-semibold text-destructive">
            Failed ({failed.length})
          </h2>
          <ul className="space-y-2">
            {failed.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                onRetry={handleRetry}
                onDelete={handleDelete}
                retrying={retry.isPending}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2" aria-labelledby="queue-heading">
        <h2 id="queue-heading" className="text-sm font-semibold">
          Queue
        </h2>
        {isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading outbox…
          </p>
        ) : active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posts yet.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                onRetry={handleRetry}
                onDelete={handleDelete}
                retrying={retry.isPending}
              />
            ))}
          </ul>
        )}
      </section>

      {dlq.length > 0 && (
        <section className="space-y-2" aria-labelledby="dlq-heading">
          <h2 id="dlq-heading" className="text-sm font-semibold text-destructive">
            Dead-letter queue ({dlq.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            These publishes exhausted all retries (1m → 5m → 30m → 2h) and were dead-lettered.
          </p>
          <ul className="space-y-2">
            {dlq.map((entry) => (
              <li
                key={entry.id}
                className="space-y-1 rounded-md border border-destructive/40 p-3"
                data-testid={`dlq-${entry.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{postLimitsFor(entry.platform).label}</span>
                  <span className="text-xs text-muted-foreground">{entry.attempts} attempt(s)</span>
                </div>
                <p role="alert" className="text-xs text-destructive">
                  {entry.lastError}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
