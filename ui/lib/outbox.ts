import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";

import { API_URL } from "./socket";
import type { PostMedia } from "./compose";

/** The five outbox states, mirroring the server `OutboxStatus`. */
export type OutboxStatus = "draft" | "scheduled" | "publishing" | "published" | "failed";

/** A persisted outbox post (mirror of the server `OutboxPost`). */
export interface OutboxPost {
  id: number;
  platform: string;
  accountId?: string;
  body: string;
  media: PostMedia[];
  status: OutboxStatus;
  publishAt?: number;
  externalId?: string;
  attempts: number;
  lastError?: string;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** A dead-letter entry surfaced from the DLQ (#89). */
export interface OutboxDlqEntry {
  id: number;
  platform: string;
  opKind: string;
  payload: unknown;
  lastError: string;
  attempts: number;
  createdAt: number;
}

/** Filters for the outbox list. */
export interface OutboxFilters {
  status?: OutboxStatus[];
  platform?: string;
  from?: number;
  to?: number;
}

/** Body accepted when creating a post. */
export interface CreatePostInput {
  platform: string;
  accountId?: string;
  body: string;
  media?: PostMedia[];
  /** When set, the post is created `scheduled` for this epoch-ms time. */
  publishAt?: number;
}

interface ListResponse {
  timestamp: string;
  posts: OutboxPost[];
}

interface DlqResponse {
  timestamp: string;
  entries: OutboxDlqEntry[];
}

interface PostResponse {
  post: OutboxPost;
}

async function readError(res: Response, fallback: string): Promise<never> {
  const detail = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(detail.error ?? `${fallback} (HTTP ${res.status})`);
}

/** Fetch the filtered outbox list. */
export async function fetchOutbox(
  filters: OutboxFilters = {},
  signal?: AbortSignal
): Promise<OutboxPost[]> {
  const params = new URLSearchParams();
  if (filters.status?.length) params.set("status", filters.status.join(","));
  if (filters.platform) params.set("platform", filters.platform);
  if (filters.from !== undefined) params.set("from", String(filters.from));
  if (filters.to !== undefined) params.set("to", String(filters.to));
  const qs = params.toString();
  const res = await fetch(`${API_URL}/api/outbox${qs ? `?${qs}` : ""}`, { signal });
  if (!res.ok) await readError(res, "failed to load outbox");
  return ((await res.json()) as ListResponse).posts;
}

/** Fetch the dead-letter queue. */
export async function fetchOutboxDlq(signal?: AbortSignal): Promise<OutboxDlqEntry[]> {
  const res = await fetch(`${API_URL}/api/outbox/dlq`, { signal });
  if (!res.ok) await readError(res, "failed to load dead-letter queue");
  return ((await res.json()) as DlqResponse).entries;
}

/** Create a draft (no `publishAt`) or scheduled post. */
export async function createPost(input: CreatePostInput): Promise<OutboxPost> {
  const res = await fetch(`${API_URL}/api/outbox`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) await readError(res, "failed to create post");
  return ((await res.json()) as PostResponse).post;
}

/** Schedule a draft (draft → scheduled). */
export async function schedulePost(id: number, publishAt: number): Promise<OutboxPost> {
  const res = await fetch(`${API_URL}/api/outbox/${id}/schedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ publishAt })
  });
  if (!res.ok) await readError(res, "failed to schedule post");
  return ((await res.json()) as PostResponse).post;
}

/**
 * Move a scheduled/failed post to a new time (drag-to-reschedule, #88). The
 * platform is intentionally never sent — it is immutable server-side.
 */
export async function reschedulePost(id: number, publishAt: number): Promise<OutboxPost> {
  const res = await fetch(`${API_URL}/api/outbox/${id}/reschedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ publishAt })
  });
  if (!res.ok) await readError(res, "failed to reschedule post");
  return ((await res.json()) as PostResponse).post;
}

/** Requeue a failed post (failed → scheduled). */
export async function retryPost(id: number, publishAt?: number): Promise<OutboxPost> {
  const res = await fetch(`${API_URL}/api/outbox/${id}/retry`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(publishAt === undefined ? {} : { publishAt })
  });
  if (!res.ok) await readError(res, "failed to retry post");
  return ((await res.json()) as PostResponse).post;
}

/** Delete a post. */
export async function deletePost(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/outbox/${id}`, { method: "DELETE" });
  if (!res.ok) await readError(res, "failed to delete post");
}

const OUTBOX_EVENTS = [
  "outbox:created",
  "outbox:updated",
  "outbox:scheduled",
  "outbox:rescheduled",
  "outbox:retried",
  "outbox:deleted",
  "outbox:published",
  "outbox:failed"
] as const;

/**
 * React Query hook for the outbox list. Subscribes to `outbox:*` socket events
 * and invalidates so the calendar/queue stay live as the poller publishes,
 * fails, and dead-letters posts.
 */
export function useOutbox(filters: OutboxFilters, socket: Socket | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["outbox", "list", filters],
    queryFn: ({ signal }) => fetchOutbox(filters, signal)
  });

  useEffect(() => {
    if (!socket) return;
    const invalidate = (): void => {
      void queryClient.invalidateQueries({ queryKey: ["outbox"] });
    };
    for (const event of OUTBOX_EVENTS) socket.on(event, invalidate);
    return () => {
      for (const event of OUTBOX_EVENTS) socket.off(event, invalidate);
    };
  }, [socket, queryClient]);

  return query;
}

/** React Query hook for the dead-letter queue, live on `outbox:failed`. */
export function useOutboxDlq(socket: Socket | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["outbox", "dlq"],
    queryFn: ({ signal }) => fetchOutboxDlq(signal)
  });

  useEffect(() => {
    if (!socket) return;
    const invalidate = (): void => {
      void queryClient.invalidateQueries({ queryKey: ["outbox", "dlq"] });
    };
    socket.on("outbox:failed", invalidate);
    return () => {
      socket.off("outbox:failed", invalidate);
    };
  }, [socket, queryClient]);

  return query;
}

function useInvalidateOutbox() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["outbox"] });
}

/** Mutation: create a draft/scheduled post. */
export function useCreatePost() {
  const invalidate = useInvalidateOutbox();
  return useMutation({
    mutationFn: (input: CreatePostInput) => createPost(input),
    onSuccess: () => void invalidate()
  });
}

/** Mutation: reschedule a post (drag-to-reschedule). */
export function useReschedulePost() {
  const invalidate = useInvalidateOutbox();
  return useMutation({
    mutationFn: ({ id, publishAt }: { id: number; publishAt: number }) =>
      reschedulePost(id, publishAt),
    onSuccess: () => void invalidate()
  });
}

/** Mutation: retry a failed post. */
export function useRetryPost() {
  const invalidate = useInvalidateOutbox();
  return useMutation({
    mutationFn: ({ id, publishAt }: { id: number; publishAt?: number }) => retryPost(id, publishAt),
    onSuccess: () => void invalidate()
  });
}

/** Mutation: delete a post. */
export function useDeletePost() {
  const invalidate = useInvalidateOutbox();
  return useMutation({
    mutationFn: (id: number) => deletePost(id),
    onSuccess: () => void invalidate()
  });
}
