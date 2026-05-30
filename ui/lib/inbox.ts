import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";

import { API_URL } from "./socket";

/** Per-platform reply constraints, mirroring the server `PlatformInboxLimits`. */
export interface PlatformInboxLimits {
  label: string;
  dmSupported: boolean;
  dmCharLimit: number;
  commentCharLimit: number;
  maxMedia: number;
}

/**
 * Client-side mirror of the server platform limits table. Kept in sync with
 * `src/inbox/platform-limits.ts`; the composer reads it to enforce character
 * limits before a reply ever leaves the browser, and the thread view reads
 * `dmSupported` to decide whether to render the DM section at all.
 */
export const PLATFORM_LIMITS: Record<string, PlatformInboxLimits> = {
  instagram: {
    label: "Instagram",
    dmSupported: true,
    dmCharLimit: 1000,
    commentCharLimit: 2200,
    maxMedia: 1
  },
  facebook: {
    label: "Facebook",
    dmSupported: true,
    dmCharLimit: 2000,
    commentCharLimit: 8000,
    maxMedia: 1
  },
  threads: {
    label: "Threads",
    dmSupported: false,
    dmCharLimit: 0,
    commentCharLimit: 500,
    maxMedia: 1
  },
  youtube: {
    label: "YouTube",
    dmSupported: false,
    dmCharLimit: 0,
    commentCharLimit: 10000,
    maxMedia: 0
  },
  linkedin: {
    label: "LinkedIn",
    dmSupported: false,
    dmCharLimit: 0,
    commentCharLimit: 1250,
    maxMedia: 0
  },
  twitter: {
    label: "X (Twitter)",
    dmSupported: true,
    dmCharLimit: 10000,
    commentCharLimit: 280,
    maxMedia: 4
  }
};

/** Fallback limits for an unknown platform. */
export const DEFAULT_LIMITS: PlatformInboxLimits = {
  label: "Unknown",
  dmSupported: false,
  dmCharLimit: 0,
  commentCharLimit: 1000,
  maxMedia: 0
};

/** Resolve limits for a platform key (case-insensitive). */
export function limitsFor(platform: string): PlatformInboxLimits {
  return PLATFORM_LIMITS[platform.toLowerCase()] ?? DEFAULT_LIMITS;
}

/** Badge presentation (label + tailwind colour classes) per platform. */
export interface PlatformBadgeMeta {
  label: string;
  className: string;
}

const BADGE_META: Record<string, PlatformBadgeMeta> = {
  instagram: {
    label: "Instagram",
    className: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200"
  },
  facebook: {
    label: "Facebook",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
  },
  threads: {
    label: "Threads",
    className: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
  },
  youtube: {
    label: "YouTube",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
  },
  linkedin: {
    label: "LinkedIn",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
  },
  twitter: {
    label: "X",
    className: "bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
  }
};

/** Resolve badge presentation for a platform key. */
export function badgeMetaFor(platform: string): PlatformBadgeMeta {
  return (
    BADGE_META[platform.toLowerCase()] ?? {
      label: platform,
      className: "bg-muted text-muted-foreground"
    }
  );
}

/** A thread summary row for the unified list (mirrors the server). */
export interface InboxThreadSummary {
  id: number;
  platform: string;
  platformThreadId: string;
  subject?: string;
  contact?: {
    id: number;
    handle?: string;
    displayName?: string;
    platformContactId: string;
    avatarUrl?: string;
  };
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCount: number;
  priority: string;
  flagged: boolean;
  dmSupported: boolean;
}

/** A single message in a thread. */
export interface InboxMessage {
  id: number;
  platform: string;
  platformMessageId: string;
  direction: "inbound" | "outbound";
  body: string;
  kind: "dm" | "comment";
  sentAt?: string;
  createdAt: string;
}

/** Full thread detail with sectioned messages. */
export interface InboxThreadDetail {
  id: number;
  platform: string;
  platformThreadId: string;
  subject?: string;
  contact?: {
    id: number;
    handle?: string;
    displayName?: string;
    platformContactId: string;
    avatarUrl?: string;
  };
  priority: string;
  flagged: boolean;
  dmSupported: boolean;
  limits: PlatformInboxLimits;
  dms: InboxMessage[];
  comments: InboxMessage[];
}

/** Filters applied to the thread list. */
export interface InboxFilters {
  platform?: string;
  search?: string;
}

/** A reply targets either the DM surface or the comment surface. */
export type ReplyKind = "dm" | "comment";

interface ThreadsResponse {
  timestamp: string;
  threads: InboxThreadSummary[];
}

interface ThreadResponse {
  timestamp: string;
  thread: InboxThreadDetail;
}

/** Fetch the filtered thread list. Reads non-secret inbox metadata only. */
export async function fetchInboxThreads(
  filters: InboxFilters = {},
  signal?: AbortSignal
): Promise<InboxThreadSummary[]> {
  const params = new URLSearchParams();
  if (filters.platform) params.set("platform", filters.platform);
  if (filters.search) params.set("search", filters.search);
  const qs = params.toString();
  const res = await fetch(`${API_URL}/api/inbox/threads${qs ? `?${qs}` : ""}`, { signal });
  if (!res.ok) throw new Error(`failed to load inbox (HTTP ${res.status})`);
  return ((await res.json()) as ThreadsResponse).threads;
}

/** Fetch one thread's detail. */
export async function fetchInboxThread(
  id: number,
  signal?: AbortSignal
): Promise<InboxThreadDetail> {
  const res = await fetch(`${API_URL}/api/inbox/threads/${id}`, { signal });
  if (!res.ok) throw new Error(`failed to load thread (HTTP ${res.status})`);
  return ((await res.json()) as ThreadResponse).thread;
}

/** Send a reply to a thread (DM via the server's sender registry). */
export async function sendInboxReply(
  id: number,
  body: string,
  kind?: "dm" | "comment"
): Promise<void> {
  const res = await fetch(`${API_URL}/api/inbox/threads/${id}/reply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body, kind })
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `reply failed (HTTP ${res.status})`);
  }
}

/** Mark a thread read. */
export async function markThreadRead(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/inbox/threads/${id}/read`, { method: "POST" });
  if (!res.ok) throw new Error(`failed to mark read (HTTP ${res.status})`);
}

/**
 * React Query hook for the thread list. Subscribes to `inbox:*` socket events
 * and refetches so the unified list stays live as new DMs/comments arrive.
 */
export function useInboxThreads(filters: InboxFilters, socket: Socket | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["inbox", "threads", filters.platform ?? "", filters.search ?? ""],
    queryFn: ({ signal }) => fetchInboxThreads(filters, signal)
  });

  useEffect(() => {
    if (!socket) return;
    const invalidate = (): void => {
      void queryClient.invalidateQueries({ queryKey: ["inbox", "threads"] });
    };
    socket.on("inbox:message", invalidate);
    socket.on("inbox:reply", invalidate);
    socket.on("inbox:read", invalidate);
    return () => {
      socket.off("inbox:message", invalidate);
      socket.off("inbox:reply", invalidate);
      socket.off("inbox:read", invalidate);
    };
  }, [socket, queryClient]);

  return query;
}

/** React Query hook for a single thread's detail. */
export function useInboxThread(id: number | null) {
  return useQuery({
    queryKey: ["inbox", "thread", id],
    queryFn: ({ signal }) => fetchInboxThread(id as number, signal),
    enabled: id !== null
  });
}

/** Mutation hook for sending a reply; invalidates the affected thread + list. */
export function useSendReply(threadId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, kind }: { body: string; kind?: "dm" | "comment" }) =>
      sendInboxReply(threadId as number, body, kind),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inbox", "thread", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["inbox", "threads"] });
    }
  });
}
