import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";

import { API_URL } from "./socket";

/** The workspace brand-voice rulebook (mirror of the server type). */
export interface BrandVoiceRulebook {
  tone: string;
  bannedWords: string[];
  exemplars: string[];
}

/** An empty rulebook, used to seed the editor before the query resolves. */
export const EMPTY_RULEBOOK: BrandVoiceRulebook = { tone: "", bannedWords: [], exemplars: [] };

/** A brand-voice score for a draft (mirror of the server `VoiceScore`). */
export interface VoiceScore {
  score: number;
  toneMatch: number;
  bannedWordPenalty: number;
  bannedHits: string[];
}

/** Routing decision recorded on an audit row. */
export type AuditDecision = "auto_send" | "queue";

/** Terminal outcome of an audited reply. */
export type AuditOutcome = "pending" | "sent" | "rejected";

/** A persisted auto-reply audit row (mirror of the server type). */
export interface AutoReplyAudit {
  id: number;
  threadId: string;
  contactId?: string;
  platform: string;
  prompt: string;
  draftText: string;
  finalText?: string;
  confidence: number;
  voiceMatch: number;
  toneMatch: number;
  bannedHits: string[];
  decision: AuditDecision;
  model?: string;
  humanOverride: boolean;
  outcome: AuditOutcome;
  createdAt: number;
  updatedAt: number;
}

/** The Hybrid posture configuration. */
export interface AutoReplyConfig {
  enabled: boolean;
  thresholds: { confidenceThreshold: number; voiceThreshold: number };
}

/** Filters for the audit log query. */
export interface AuditFilters {
  threadId?: string;
  since?: number;
  until?: number;
  limit?: number;
}

interface RulebookResponse {
  rulebook: BrandVoiceRulebook;
}
interface VoiceResponse {
  voice: VoiceScore;
}
interface AuditListResponse {
  audits: AutoReplyAudit[];
}
interface AuditResponse {
  audit: AutoReplyAudit;
}

async function readError(res: Response, fallback: string): Promise<never> {
  const detail = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(detail.error ?? `${fallback} (HTTP ${res.status})`);
}

/** Fetch the Hybrid posture configuration. */
export async function fetchAutoReplyConfig(signal?: AbortSignal): Promise<AutoReplyConfig> {
  const res = await fetch(`${API_URL}/api/auto-reply/config`, { signal });
  if (!res.ok) await readError(res, "failed to load auto-reply config");
  return (await res.json()) as AutoReplyConfig;
}

/** Fetch the brand-voice rulebook. */
export async function fetchRulebook(signal?: AbortSignal): Promise<BrandVoiceRulebook> {
  const res = await fetch(`${API_URL}/api/auto-reply/rulebook`, { signal });
  if (!res.ok) await readError(res, "failed to load rulebook");
  return ((await res.json()) as RulebookResponse).rulebook;
}

/** Replace the brand-voice rulebook. */
export async function saveRulebook(input: BrandVoiceRulebook): Promise<BrandVoiceRulebook> {
  const res = await fetch(`${API_URL}/api/auto-reply/rulebook`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) await readError(res, "failed to save rulebook");
  return ((await res.json()) as RulebookResponse).rulebook;
}

/** Score an ad-hoc draft against the live rulebook. */
export async function scoreDraft(draft: string): Promise<VoiceScore> {
  const res = await fetch(`${API_URL}/api/auto-reply/score`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft })
  });
  if (!res.ok) await readError(res, "failed to score draft");
  return ((await res.json()) as VoiceResponse).voice;
}

/** Fetch the audit log, optionally filtered by thread and time range. */
export async function fetchAuditLog(
  filters: AuditFilters = {},
  signal?: AbortSignal
): Promise<AutoReplyAudit[]> {
  const params = new URLSearchParams();
  if (filters.threadId) params.set("threadId", filters.threadId);
  if (filters.since !== undefined) params.set("since", String(filters.since));
  if (filters.until !== undefined) params.set("until", String(filters.until));
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const qs = params.toString();
  const res = await fetch(`${API_URL}/api/auto-reply/audit${qs ? `?${qs}` : ""}`, { signal });
  if (!res.ok) await readError(res, "failed to load audit log");
  return ((await res.json()) as AuditListResponse).audits;
}

/** Approve or reject a queued draft. */
export async function resolveAudit(
  id: number,
  approve: boolean,
  editedText?: string
): Promise<AutoReplyAudit> {
  const res = await fetch(`${API_URL}/api/auto-reply/audit/${id}/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(editedText === undefined ? { approve } : { approve, editedText })
  });
  if (!res.ok) await readError(res, "failed to resolve draft");
  return ((await res.json()) as AuditResponse).audit;
}

const AUTO_REPLY_EVENTS = ["autoReply:sent", "autoReply:queued", "autoReply:rejected"] as const;

/** React Query hook for the Hybrid posture config. */
export function useAutoReplyConfig() {
  return useQuery({
    queryKey: ["auto-reply", "config"],
    queryFn: ({ signal }) => fetchAutoReplyConfig(signal)
  });
}

/** React Query hook for the brand-voice rulebook. */
export function useRulebook() {
  return useQuery({
    queryKey: ["auto-reply", "rulebook"],
    queryFn: ({ signal }) => fetchRulebook(signal)
  });
}

/** Mutation: save the brand-voice rulebook. */
export function useSaveRulebook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BrandVoiceRulebook) => saveRulebook(input),
    onSuccess: (rulebook) => {
      queryClient.setQueryData(["auto-reply", "rulebook"], rulebook);
    }
  });
}

/** Mutation: score an ad-hoc draft. */
export function useScoreDraft() {
  return useMutation({
    mutationFn: (draft: string) => scoreDraft(draft)
  });
}

/**
 * React Query hook for the audit log. Subscribes to `autoReply:*` socket events
 * and invalidates so the decision log stays live as drafts are sent, queued,
 * and rejected.
 */
export function useAuditLog(filters: AuditFilters, socket: Socket | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["auto-reply", "audit", filters],
    queryFn: ({ signal }) => fetchAuditLog(filters, signal)
  });

  useEffect(() => {
    if (!socket) return;
    const invalidate = (): void => {
      void queryClient.invalidateQueries({ queryKey: ["auto-reply", "audit"] });
    };
    for (const event of AUTO_REPLY_EVENTS) socket.on(event, invalidate);
    return () => {
      for (const event of AUTO_REPLY_EVENTS) socket.off(event, invalidate);
    };
  }, [socket, queryClient]);

  return query;
}

/** Mutation: approve/reject a queued draft. */
export function useResolveAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      approve,
      editedText
    }: {
      id: number;
      approve: boolean;
      editedText?: string;
    }) => resolveAudit(id, approve, editedText),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auto-reply", "audit"] });
    }
  });
}
