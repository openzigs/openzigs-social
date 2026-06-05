import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";

import { API_URL } from "./socket";

/** Lead-score bucket, mirroring the server `LeadBucket`. */
export type LeadBucket = "top" | "high" | "medium" | "low";

/** A deterministic lead score, mirroring the server `LeadScore`. */
export interface LeadScore {
  score: number;
  bucket: LeadBucket;
  components: {
    engagement: number;
    sentiment: number;
    follower: number;
  };
}

/** A linked platform-native account on a CRM identity. */
export interface LinkedAccount {
  socialContactId: number;
  platform: string;
  platformContactId: string;
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
}

/** A single message in a contact's unified conversation timeline. */
export interface TimelineMessage {
  id: number;
  platform: string;
  direction: "inbound" | "outbound";
  body: string;
  at: string;
}

/** A CRM identity enriched with its lead score (list payload). */
export interface ScoredContact {
  id: number;
  displayName?: string;
  email?: string;
  followerCount: number;
  createdAt: string;
  updatedAt: string;
  linkedAccounts: LinkedAccount[];
  engagementCount: number;
  leadScore: LeadScore;
}

/** Full contact detail: scored contact + conversation timeline. */
export interface ContactDetail extends ScoredContact {
  timeline: TimelineMessage[];
  /**
   * Number of merge-audit rows where this contact was the survivor.
   * Used by the delete dialog to conditionally show the cascade option.
   * Defaults to 0 when absent (older API payloads).
   */
  mergeCount?: number;
}

/** A suggested merge: two identities sharing a normalised email. */
export interface SuggestedMerge {
  email: string;
  contacts: [ScoredContact, ScoredContact] | ScoredContact[];
}

/** Presentation metadata (label + tailwind classes) per lead bucket. */
export interface BucketMeta {
  label: string;
  className: string;
}

const BUCKET_META: Record<LeadBucket, BucketMeta> = {
  top: {
    label: "Top",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
  },
  high: {
    label: "High",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
  },
  medium: {
    label: "Medium",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
  },
  low: {
    label: "Low",
    className: "bg-muted text-muted-foreground"
  }
};

/** Resolve presentation metadata for a lead bucket. */
export function bucketMetaFor(bucket: LeadBucket): BucketMeta {
  return BUCKET_META[bucket] ?? BUCKET_META.low;
}

interface ContactsResponse {
  timestamp: string;
  contacts: ScoredContact[];
}

interface ContactResponse {
  timestamp: string;
  contact: ContactDetail;
}

interface SuggestionsResponse {
  timestamp: string;
  suggestions: SuggestedMerge[];
}

/** Fetch the scored contact list. Reads non-secret CRM metadata only. */
export async function fetchContacts(signal?: AbortSignal): Promise<ScoredContact[]> {
  const res = await fetch(`${API_URL}/api/contacts`, { signal });
  if (!res.ok) throw new Error(`failed to load contacts (HTTP ${res.status})`);
  return ((await res.json()) as ContactsResponse).contacts;
}

/** Fetch one contact's detail (scored contact + timeline). */
export async function fetchContact(id: number, signal?: AbortSignal): Promise<ContactDetail> {
  const res = await fetch(`${API_URL}/api/contacts/${id}`, { signal });
  if (!res.ok) throw new Error(`failed to load contact (HTTP ${res.status})`);
  return ((await res.json()) as ContactResponse).contact;
}

/** Fetch the suggested-merge queue (email-match identities). */
export async function fetchSuggestedMerges(signal?: AbortSignal): Promise<SuggestedMerge[]> {
  const res = await fetch(`${API_URL}/api/contacts/suggested-merges`, { signal });
  if (!res.ok) throw new Error(`failed to load suggested merges (HTTP ${res.status})`);
  return ((await res.json()) as SuggestionsResponse).suggestions;
}

/** Fold a source identity into a survivor. */
export async function mergeContacts(
  survivorId: number,
  sourceId: number,
  mode: "manual" | "suggested" = "manual"
): Promise<void> {
  const res = await fetch(`${API_URL}/api/contacts/merge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ survivorId, sourceId, mode })
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `merge failed (HTTP ${res.status})`);
  }
}

/**
 * React Query hook for the contact list. Subscribes to `crm:merge` socket
 * events and refetches so the list stays live after a merge.
 */
export function useContacts(socket: Socket | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["crm", "contacts"],
    queryFn: ({ signal }) => fetchContacts(signal)
  });

  useEffect(() => {
    if (!socket) return;
    const invalidate = (): void => {
      void queryClient.invalidateQueries({ queryKey: ["crm"] });
    };
    socket.on("crm:merge", invalidate);
    return () => {
      socket.off("crm:merge", invalidate);
    };
  }, [socket, queryClient]);

  return query;
}

/** React Query hook for a single contact's detail. */
export function useContact(id: number | null) {
  return useQuery({
    queryKey: ["crm", "contact", id],
    queryFn: ({ signal }) => fetchContact(id as number, signal),
    enabled: id !== null
  });
}

/** React Query hook for the suggested-merge queue. */
export function useSuggestedMerges() {
  return useQuery({
    queryKey: ["crm", "suggested-merges"],
    queryFn: ({ signal }) => fetchSuggestedMerges(signal)
  });
}

/** Mutation hook for merging contacts; invalidates the contact caches. */
export function useMergeContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      survivorId,
      sourceId,
      mode
    }: {
      survivorId: number;
      sourceId: number;
      mode?: "manual" | "suggested";
    }) => mergeContacts(survivorId, sourceId, mode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["crm"] });
    }
  });
}

/** Per-table row counts returned in a GDPR delete receipt. */
export interface GdprDeleteRowCounts {
  contacts: number;
  social_messages: number;
  auto_reply_audit: number;
  platform_insights_raw: number;
  merged_contacts?: number;
}

/** Receipt returned from a successful GDPR delete. */
export interface GdprDeleteReceipt {
  deletedAt: string;
  contactId: string;
  rowsDeleted: GdprDeleteRowCounts;
}

interface DeleteReceiptResponse {
  receipt: GdprDeleteReceipt;
}

/**
 * Delete a contact (GDPR right-to-delete, #138).
 * @param cascade - When true, also purges merge-history audit rows.
 */
export async function deleteContact(id: number, cascade: boolean): Promise<GdprDeleteReceipt> {
  const res = await fetch(`${API_URL}/api/contacts/${id}?cascade=${String(cascade)}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `delete failed (HTTP ${res.status})`);
  }
  return ((await res.json()) as DeleteReceiptResponse).receipt;
}

/** Mutation hook for GDPR contact deletion; invalidates the contact caches. */
export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cascade }: { id: number; cascade: boolean }) => deleteContact(id, cascade),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["crm"] });
    }
  });
}
