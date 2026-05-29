import { API_URL } from "./socket";

/** Platforms the composer can publish to (mirrors the server). */
export type ConnectionPlatform =
  | "instagram"
  | "facebook"
  | "threads"
  | "linkedin"
  | "pinterest"
  | "tiktok";

/** One connectable publish target, as returned by `GET /api/connections`. */
export interface ConnectionSummary {
  platform: ConnectionPlatform;
  label: string;
  connected: boolean;
  needsReconsent: boolean;
  expiresAt?: number;
}

interface ConnectionsResponse {
  timestamp: string;
  connections: ConnectionSummary[];
}

/**
 * Fetch the list of social connections from the server. The endpoint returns
 * only non-secret connection metadata — never token material.
 */
export async function fetchConnections(signal?: AbortSignal): Promise<ConnectionSummary[]> {
  const res = await fetch(`${API_URL}/api/connections`, { signal });
  if (!res.ok) {
    throw new Error(`failed to load connections (HTTP ${res.status})`);
  }
  const body = (await res.json()) as ConnectionsResponse;
  return body.connections;
}
