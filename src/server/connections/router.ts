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

import type { CredentialVault } from "../../vault/index.js";

export interface ConnectionsRouterDeps {
  vault: CredentialVault;
}

/** Publish-capable Meta platforms, in display order. */
const META_PLATFORMS = ["instagram", "facebook", "threads"] as const;
type MetaPlatform = (typeof META_PLATFORMS)[number];

const PLATFORM_LABELS: Record<MetaPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook Pages",
  threads: "Threads"
};

export interface ConnectionSummary {
  platform: MetaPlatform;
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

  router.get("/", async (_req: Request, res: Response) => {
    const oauth = await deps.vault.listOAuth();
    const connections: ConnectionSummary[] = META_PLATFORMS.map((platform) => {
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
