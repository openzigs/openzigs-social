import { API_URL } from "./socket";

/** Month-to-date X write-quota usage, mirroring the server `CreditSummary`. */
export interface TwitterQuotaSummary {
  /** Usage bucket in `YYYY-MM` (UTC). */
  month: string;
  /** Writes (tweets + replies + DMs) recorded this month. */
  used: number;
  /** Monthly write cap for the active tier. */
  cap: number;
  /** Remaining writes before the cap (never negative). */
  remaining: number;
  /** Fraction of the cap consumed, 0..1+. */
  ratio: number;
}

/** Response envelope for `GET /api/twitter/quota`. */
export interface TwitterQuotaResponse {
  timestamp: string;
  tier: string;
  quota: TwitterQuotaSummary;
}

/** Payload of the `twitter:quota` socket event (#70). */
export interface TwitterQuotaEvent {
  level: "warning" | "exceeded";
  summary: TwitterQuotaSummary;
}

/**
 * Fetch the X write-quota usage from the server. Reads only the non-secret
 * credit ledger — never token material.
 */
export async function fetchTwitterQuota(signal?: AbortSignal): Promise<TwitterQuotaResponse> {
  const res = await fetch(`${API_URL}/api/twitter/quota`, { signal });
  if (!res.ok) {
    throw new Error(`failed to load X quota (HTTP ${res.status})`);
  }
  return (await res.json()) as TwitterQuotaResponse;
}
