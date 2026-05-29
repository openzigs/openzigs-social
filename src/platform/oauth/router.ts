/**
 * OAuth callback router (#139).
 *
 * Mounts at `/oauth`, exposing `GET /callback/:platform?code&state`.
 *
 * Flow:
 *   1. Look up the connector for `:platform` (404 if unknown — no stack trace).
 *   2. Validate + consume the CSRF `state` (400 on missing/invalid/expired/replayed).
 *   3. Require a `code` (400 if absent).
 *   4. Exchange the code via the connector's {@link OAuthTokenExchanger}.
 *   5. Persist tokens in the credential vault (encrypted at rest).
 *   6. Redirect to the configured success path (default `/`).
 *
 * Security (OWASP):
 *   - State is the anti-CSRF token: opaque, single-use, time-bounded,
 *     constant-time compared (see {@link OAuthStateStore}).
 *   - The `code` and any tokens are NEVER logged nor echoed in responses.
 *   - Exchange failures return a generic 502; connector internals are not leaked.
 */
import { Router, type Request, type Response } from "express";

import type { OAuthCredential } from "../../vault/index.js";
import type { ConnectorRegistry } from "./connector-registry.js";
import type { OAuthStateStore } from "./state-store.js";

/** Minimal vault surface the router needs (eases testing). */
export interface OAuthVault {
  setOAuth(platform: string, cred: OAuthCredential): Promise<void>;
}

/** Structured logger surface (a subset of the app logger). */
export interface OAuthLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface OAuthRouterDeps {
  registry: ConnectorRegistry;
  stateStore: OAuthStateStore;
  vault: OAuthVault;
  logger?: OAuthLogger;
  /**
   * Path to redirect to after a successful connection. Default `/`.
   * The platform is appended as a query param for the UI to react to.
   */
  successRedirect?: string;
  /** Path to redirect to on user-facing failure. Default `successRedirect`. */
  failureRedirect?: string;
  /** Injectable clock (ms) for expiry math. Default `Date.now`. */
  now?: () => number;
}

function isSafeRelativePath(p: string): boolean {
  // Only allow same-origin relative redirects to avoid open-redirect abuse.
  return p.startsWith("/") && !p.startsWith("//") && !p.includes("\\");
}

/** Build the OAuth callback router. */
export function createOAuthRouter(deps: OAuthRouterDeps): Router {
  const router = Router();
  const now = deps.now ?? Date.now;
  const successRedirect =
    deps.successRedirect && isSafeRelativePath(deps.successRedirect) ? deps.successRedirect : "/";
  const failureRedirect =
    deps.failureRedirect && isSafeRelativePath(deps.failureRedirect)
      ? deps.failureRedirect
      : successRedirect;

  router.get("/callback/:platform", (req: Request, res: Response): void => {
    void (async () => {
      const platform = String(req.params.platform ?? "").toLowerCase();

      // 1. Unknown platform → 404, no internals leaked.
      const exchanger = deps.registry.get(platform);
      if (!exchanger) {
        res.status(404).json({ error: "unknown platform" });
        return;
      }

      // 2. CSRF state must be present, valid, unexpired, and unused.
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const record = deps.stateStore.consume(platform, state);
      if (!record) {
        deps.logger?.warn({ platform }, "oauth callback rejected: invalid state");
        res.status(400).json({ error: "invalid or expired state" });
        return;
      }

      // 3. Authorisation code required.
      const code = typeof req.query.code === "string" ? req.query.code : "";
      if (code.length === 0) {
        res.status(400).json({ error: "missing authorization code" });
        return;
      }

      // 4. Exchange the code for tokens (never log the code/tokens).
      let token;
      try {
        token = await exchanger.exchangeCode(code, { metadata: record.metadata });
      } catch (err) {
        deps.logger?.error(
          { platform, err: err instanceof Error ? err.message : "error" },
          "oauth token exchange failed"
        );
        res.status(502).json({ error: "token exchange failed" });
        return;
      }

      // 5. Persist tokens (encrypted) in the vault.
      const expiresAt =
        token.expiresAt ??
        (typeof token.expiresInSec === "number" ? now() + token.expiresInSec * 1000 : undefined);
      const cred: OAuthCredential = {
        accessToken: token.accessToken,
        ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
        ...(expiresAt ? { expiresAt } : {})
      };
      await deps.vault.setOAuth(platform, cred);
      deps.logger?.info({ platform }, "oauth connection stored");

      // 6. Redirect back to the UI (relative, same-origin).
      const sep = successRedirect.includes("?") ? "&" : "?";
      res.redirect(`${successRedirect}${sep}connected=${encodeURIComponent(platform)}`);
    })().catch(() => {
      const sep = failureRedirect.includes("?") ? "&" : "?";
      res.redirect(`${failureRedirect}${sep}oauth_error=1`);
    });
  });

  return router;
}
