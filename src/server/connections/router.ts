/**
 * Connections API router (epic #53).
 *
 * Route (under `/api/connections`):
 *   - GET / — list connected social accounts the composer can publish to.
 *
 * Secret handling (OWASP): this endpoint reads OAuth credentials from the
 * encrypted vault but NEVER echoes any token material. Only non-secret
 * connection metadata (platform key, label, expiry, re-consent flag) is
 * returned, in the flat JSON envelope used across the API.
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";

import type { CredentialVault } from "../../vault/index.js";

export interface ConnectionsRouterDeps {
  vault: CredentialVault;
}

/** Publish-capable platforms, in display order. */
const PLATFORMS = [
  "instagram",
  "facebook",
  "threads",
  "linkedin",
  "pinterest",
  "tiktok",
  "twitter"
] as const;
type Platform = (typeof PLATFORMS)[number];

const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook Pages",
  threads: "Threads",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  tiktok: "TikTok",
  twitter: "X (Twitter)"
};

export interface ConnectionSummary {
  platform: Platform;
  label: string;
  connected: boolean;
  /** True when a token refresh hard-failed and the user must reconnect. */
  needsReconsent: boolean;
  /** Unix epoch ms when the access token expires, if known. */
  expiresAt?: number;
}

/** Build the connections router bound to a live vault. */
export function createConnectionsRouter(deps: ConnectionsRouterDeps): Router {
  const router = Router();

  // Rate-limit the credential-backed read so a misbehaving (or hostile) client
  // can't hammer the vault: 60 requests/minute per IP is ample for the UI,
  // which polls connection status at most a few times per page view.
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  });

  router.get("/", limiter, async (_req: Request, res: Response) => {
    const oauth = await deps.vault.listOAuth();
    const connections: ConnectionSummary[] = PLATFORMS.map((platform) => {
      const cred = oauth[platform];
      return {
        platform,
        label: PLATFORM_LABELS[platform],
        connected: cred !== undefined && cred.needsReconsent !== true,
        needsReconsent: cred?.needsReconsent === true,
        expiresAt: cred?.expiresAt
      };
    });
    res.status(200).json({ timestamp: new Date().toISOString(), connections });
  });

  return router;
}
