/**
 * Social setup API router (epic #100, sub #105 + #106).
 *
 * Routes (under `/api/social-setup`):
 *   - GET  /status            — per-platform app-configured / connected state,
 *                               scopes, and the callback redirect URI the
 *                               operator must register in each platform's
 *                               developer console.
 *   - POST /:platform/authorize — mint a CSRF state and build the OAuth
 *                               authorize URL the wizard redirects to. 409 when
 *                               the platform's app credentials are unset.
 *   - POST /meta/app          — store the per-user Meta app id/secret in the
 *                               vault (drives the #106 Meta app wizard) and
 *                               return the copy-pasteable scopes + redirect URIs.
 *
 * Secret handling (OWASP): app secrets are written to the encrypted vault and
 * NEVER echoed. The authorize URL embeds only the (non-secret) app id, the
 * requested scopes, and a single-use CSRF state. Platform path params are
 * validated against a fixed allowlist (A03 — no open redirect / SSRF).
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import type { CredentialVault } from "../../vault/index.js";
import type { OAuthStateStore } from "../../platform/oauth/state-store.js";
import {
  PLATFORM_SETUP,
  SOCIAL_PLATFORMS,
  buildAuthorizeUrl,
  isSocialPlatform,
  resolveClientId,
  type SocialPlatform
} from "./platforms.js";

/** Meta platforms backed by the single Meta app credential. */
const META_PLATFORMS: SocialPlatform[] = ["instagram", "facebook", "threads"];

export interface SocialSetupRouterDeps {
  vault: CredentialVault;
  stateStore: OAuthStateStore;
  /** Public origin the callback router is reachable at (no trailing slash). */
  publicBaseUrl?: string;
}

const MetaAppBody = z
  .object({
    appId: z.string().trim().min(1).max(128),
    appSecret: z.string().trim().min(1).max(256)
  })
  .strict();

function callbackUri(base: string, platform: string): string {
  return `${base.replace(/\/$/, "")}/oauth/callback/${platform}`;
}

/** Build the social-setup router. */
export function createSocialSetupRouter(deps: SocialSetupRouterDeps): Router {
  const router = Router();
  const baseUrl = deps.publicBaseUrl ?? "http://localhost:3000";

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  });

  router.get("/status", limiter, (_req: Request, res: Response): void => {
    void (async () => {
      const oauth = await deps.vault.listOAuth();
      const platforms = await Promise.all(
        SOCIAL_PLATFORMS.map(async (platform) => {
          const meta = PLATFORM_SETUP[platform];
          const clientId = await resolveClientId(deps.vault, meta.credential);
          const cred = oauth[platform];
          return {
            platform,
            label: meta.label,
            appConfigured: Boolean(clientId),
            connected: cred !== undefined && cred.needsReconsent !== true,
            needsReconsent: cred?.needsReconsent === true,
            scopes: meta.scopes,
            redirectUri: callbackUri(baseUrl, platform)
          };
        })
      );
      res.status(200).json({ timestamp: new Date().toISOString(), platforms });
    })().catch(() => {
      res.status(500).json({ error: "internal error" });
    });
  });

  router.post("/:platform/authorize", limiter, (req: Request, res: Response): void => {
    void (async () => {
      const platform = String(req.params.platform);
      if (!isSocialPlatform(platform)) {
        res.status(404).json({ error: "unknown platform" });
        return;
      }
      const meta = PLATFORM_SETUP[platform];
      const clientId = await resolveClientId(deps.vault, meta.credential);
      if (!clientId) {
        res.status(409).json({ error: `app credentials for ${platform} are not configured` });
        return;
      }
      const redirectUri = callbackUri(baseUrl, platform);
      const state = deps.stateStore.issue(platform, { redirectUri });
      const url = buildAuthorizeUrl(meta, { clientId, redirectUri, state });
      res.status(200).json({ platform, url, state, redirectUri, scopes: meta.scopes });
    })().catch(() => {
      res.status(500).json({ error: "internal error" });
    });
  });

  router.post("/meta/app", limiter, (req: Request, res: Response): void => {
    void (async () => {
      const parsed = MetaAppBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid request" });
        return;
      }
      await deps.vault.setMeta({ appId: parsed.data.appId, appSecret: parsed.data.appSecret });
      const redirectUris = META_PLATFORMS.map((platform) => ({
        platform,
        redirectUri: callbackUri(baseUrl, platform)
      }));
      // Union of scopes the Meta wizard instructs the operator to enable.
      const scopes = [...new Set(META_PLATFORMS.flatMap((p) => PLATFORM_SETUP[p].scopes))];
      const body = {
        stored: true,
        appId: parsed.data.appId,
        scopes,
        redirectUris
      };
      // Defense in depth: never let the secret leak into the response.
      if (JSON.stringify(body).includes(parsed.data.appSecret)) {
        res.status(500).json({ error: "internal error" });
        return;
      }
      res.status(200).json(body);
    })().catch(() => {
      res.status(500).json({ error: "internal error" });
    });
  });

  return router;
}
