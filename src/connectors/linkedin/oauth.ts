/**
 * LinkedIn OAuth token exchanger + scope policy (#61).
 *
 * Implements the platform-service {@link OAuthTokenExchanger} port (#139): the
 * shared `createOAuthRouter` owns `/oauth/callback/:platform`, CSRF state, and
 * vault persistence — this connector supplies only the code→token exchange.
 *
 * LinkedIn uses the standard OAuth 2.0 authorization-code flow:
 *   `POST https://www.linkedin.com/oauth/v2/accessToken` with a form body of
 *   `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`,
 *   `client_secret`. The response carries `access_token`, `expires_in`, and
 *   (for member tokens) `refresh_token` + `refresh_token_expires_in`.
 *
 * ## v1 scope policy — NO DM scopes (epic #60 / #61 hard constraint)
 *
 * LinkedIn direct messaging requires the gated **Compliance Partner Program**,
 * which is out-of-scope for v1. This connector therefore requests ONLY
 * comment + post-publish scopes and {@link assertNoDmScopes} fails closed if a
 * messaging scope ever leaks into the requested set. The DM scopes are never
 * implemented and never requested.
 *
 * Security (OWASP): the app secret comes from the vault at runtime (BYOK),
 * never hardcoded and never logged; token responses are returned to the router
 * (which encrypts them) and never written to a log line. The token URL is
 * SSRF-validated.
 */
import type { ExchangeContext, ExchangedToken, OAuthTokenExchanger } from "../../platform/index.js";
import { assertSafeUrl } from "../../server/setup/ssrf.js";
import { LinkedInApiError, type FetchLike } from "./rest-client.js";

/** Default LinkedIn token endpoint. */
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";

/**
 * v1 scopes: member-level comment + post publish, plus the equivalent
 * organization scopes. Deliberately excludes ALL messaging/DM scopes.
 */
export const LINKEDIN_DEFAULT_SCOPES = [
  "w_member_social",
  "r_member_social",
  "w_organization_social",
  "r_organization_social"
] as const;

/**
 * LinkedIn messaging/DM scopes that are forbidden in v1. Requesting any of
 * these requires the Compliance Partner Program (gated) and is rejected.
 */
export const LINKEDIN_FORBIDDEN_DM_SCOPES = [
  "r_messages",
  "w_messages",
  "rw_messages",
  "r_dma_portability_self_serve",
  "messaging"
] as const;

/** Thrown when a requested scope set contains a forbidden DM scope. */
export class LinkedInDmScopeError extends Error {
  constructor(scope: string) {
    super(
      `LinkedIn DM scope "${scope}" is not allowed in v1 (requires the gated Compliance Partner Program)`
    );
    this.name = "LinkedInDmScopeError";
  }
}

/**
 * Fail closed on any DM/messaging scope. A scope matches if it is one of the
 * known forbidden scopes or contains the `messag` / `dma` token, so a typo or a
 * newly-added messaging scope can never silently slip through.
 */
export function assertNoDmScopes(scopes: readonly string[]): void {
  const forbidden = new Set<string>(LINKEDIN_FORBIDDEN_DM_SCOPES);
  for (const scope of scopes) {
    const normalized = scope.trim().toLowerCase();
    if (forbidden.has(normalized) || normalized.includes("messag") || normalized.includes("dma")) {
      throw new LinkedInDmScopeError(scope);
    }
  }
}

/** Resolved LinkedIn app credentials (BYOK; sourced from the vault). */
export interface LinkedInAppCredentials {
  clientId: string;
  clientSecret: string;
}

/** Async resolver for LinkedIn app credentials. Returns `undefined` when unset. */
export type LinkedInAppCredentialsProvider = () => Promise<LinkedInAppCredentials | undefined>;

/** Thrown when the connector is asked to exchange a code without app creds. */
export class LinkedInAppNotConfiguredError extends Error {
  constructor() {
    super("linkedin app credentials not configured");
    this.name = "LinkedInAppNotConfiguredError";
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

async function readToken(res: Response): Promise<TokenResponse> {
  const text = await res.text();
  let body: TokenResponse = {};
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as TokenResponse;
    } catch {
      body = {};
    }
  }
  if (!res.ok) {
    throw new LinkedInApiError(`linkedin token exchange failed (HTTP ${res.status})`, {
      httpStatus: res.status,
      transient: res.status === 429 || res.status >= 500
    });
  }
  if (typeof body.access_token !== "string") {
    throw new LinkedInApiError("linkedin token exchange returned no access_token", {
      httpStatus: res.status,
      transient: false
    });
  }
  return body;
}

export interface LinkedInOAuthExchangerOptions {
  /** Token endpoint. Defaults to {@link LINKEDIN_TOKEN_URL}. */
  tokenUrl?: string;
  /** The same redirect URI used to start the flow (`/oauth/callback/linkedin`). */
  redirectUri: string;
  /** Resolves client id/secret at call time (BYOK). */
  getAppCredentials: LinkedInAppCredentialsProvider;
  /** Requested OAuth scopes. Defaults to {@link LINKEDIN_DEFAULT_SCOPES}. */
  scopes?: readonly string[];
  /** Injected transport. Defaults to global `fetch`. */
  fetchImpl?: FetchLike;
}

/**
 * LinkedIn OAuth exchanger. Exchanges the auth code for an access token (plus a
 * refresh token for member apps) via the form-encoded token endpoint.
 */
export class LinkedInOAuthExchanger implements OAuthTokenExchanger {
  readonly platform = "linkedin";
  /** The scopes this exchanger advertises for the authorize URL. */
  readonly scopes: readonly string[];
  private readonly tokenUrl: string;
  private readonly redirectUri: string;
  private readonly getAppCredentials: LinkedInAppCredentialsProvider;
  private readonly fetchImpl: FetchLike;

  constructor(opts: LinkedInOAuthExchangerOptions) {
    const tokenUrl = opts.tokenUrl ?? LINKEDIN_TOKEN_URL;
    assertSafeUrl(tokenUrl);
    this.scopes = opts.scopes ?? LINKEDIN_DEFAULT_SCOPES;
    // Hard fail at construction if a DM scope was ever requested.
    assertNoDmScopes(this.scopes);
    this.tokenUrl = tokenUrl;
    this.redirectUri = opts.redirectUri;
    this.getAppCredentials = opts.getAppCredentials;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  }

  async exchangeCode(code: string, _ctx?: ExchangeContext): Promise<ExchangedToken> {
    const app = await this.getAppCredentials();
    if (!app) throw new LinkedInAppNotConfiguredError();

    const form = new URLSearchParams();
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("redirect_uri", this.redirectUri);
    form.set("client_id", app.clientId);
    form.set("client_secret", app.clientSecret);

    const token = await readToken(
      await this.fetchImpl(this.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form
      })
    );

    return {
      accessToken: token.access_token as string,
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      ...(token.expires_in ? { expiresInSec: token.expires_in } : {})
    };
  }
}
