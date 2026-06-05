import { API_URL } from "./socket";

/** Today's YouTube Data API v3 quota usage. */
export interface YouTubeQuotaInfo {
  /** UTC date bucket 'YYYY-MM-DD' the usage counts against. */
  day_utc: string;
  /** Quota units consumed today. */
  used: number;
  /** Daily quota ceiling (10,000). */
  limit: number;
  /** Percentage of daily limit consumed (0–100). */
  pct: number;
}

/**
 * Fetch today's YouTube Data API v3 quota usage from the server.
 * Reads only the non-secret daily quota ledger — never token material.
 */
export async function getYouTubeQuota(signal?: AbortSignal): Promise<YouTubeQuotaInfo> {
  const res = await fetch(`${API_URL}/api/youtube/quota`, { signal });
  if (!res.ok) {
    throw new Error(`failed to load YouTube quota (HTTP ${res.status})`);
  }
  return (await res.json()) as YouTubeQuotaInfo;
}
