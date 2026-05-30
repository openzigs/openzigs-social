/**
 * X (Twitter) OAuth 2.0 + PKCE token exchanger — Cohort C (#66, sub #67).
 *
 * Implements the platform-service {@link OAuthTokenExchanger} port (#139): the
 * shared `createOAuthRouter` owns `/oauth/callback/:platform`, CSRF state, and
 * vault persistence — this connector supplies only the code→token exchange.
 *
 * X uses OAuth 2.0 Authorization Code with **PKCE**:
 *   `POST https://api.twitter.com/2/oauth2/token` with a form body of
 *   `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`,
 *   `client_id`. The `code_verifier` minted when the authorize URL was built is
 *   threaded back to us through `ctx.metadata.codeVerifier` (the shared router
 *   passes the stored `state` record's metadata into `exchangeCode`).
 *
 * Public vs confidential clients:
 *   - Public client (no secret): `client_id` goes in the body, no auth header.
 *   - Confidential client (BYOK secret): HTTP **Basic** `client_id:client_secret`
 *     auth header is sent (X's documented confidential-client flow).
 *   Either way the `code_verifier` is always present — PKCE is mandatory.
 *
 * Security (OWASP): the app secret comes from the vault at runtime (BYOK),
 * never hardcoded and never logged; token responses are returned to the router
 * (which encrypts them) and never written to a log line. The token URL is
 * SSRF-validated.
 */
import type { ExchangeContext, ExchangedToken, OAuthTokenExchanger } from "../../platform/index.js";
import { assertSafeUrl } from "../../server/setup/ssrf.js";
import { TwitterApiError, type FetchLike } from "./rest-client.js";

/** Default X OAuth 2.0 token endpoint. */
export const TWITTER_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";

/**
 * Default scopes: read + write tweets, read user, and a refresh token. DM
 * scopes (`dm.read`, `dm.write`) are added by the connector wiring ONLY when
 * the tier permits DM and the user opted in — never by default.
 */
export const TWITTER_DEFAULT_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access"
] as const;

/** X DM scopes, appended only on a DM-enabled paid tier. */
export const TWITTER_DM_SCOPES = ["dm.read", "dm.write"] as const;

/** Resolved X app credentials (BYOK; sourced from the vault). */
export interface TwitterAppCredentials {
  clientId: string;
  /** Optional — present for confidential clients, absent for public PKCE. */
  clientSecret?: string;
}

/** Async resolver for X app credentials. Returns `undefined` when unset. */
export type TwitterAppCredentialsProvider = () => Promise<TwitterAppCredentials | undefined>;

/** Thrown when the connector is asked to exchange a code without app creds. */
export class TwitterAppNotConfiguredError extends Error {
  constructor() {
    super("x (twitter) app credentials not configured");
    this.name = "TwitterAppNotConfiguredError";
  }
}

/** Thrown when the OAuth callback arrives without a PKCE code verifier. */
export class TwitterPkceMissingError extends Error {
  constructor() {
    super("x (twitter) oauth callback missing PKCE code_verifier");
    this.name = "TwitterPkceMissingError";
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
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
    throw new TwitterApiError(`x token exchange failed (HTTP ${res.status})`, {
      httpStatus: res.status,
      transient: res.status === 429 || res.status >= 500
    });
  }
  if (typeof body.access_token !== "string") {
    throw new TwitterApiError("x token exchange returned no access_token", {
      httpStatus: res.status,
      transient: false
    });
  }
  return body;
}

export interface TwitterOAuthExchangerOptions {
  /** Token endpoint. Defaults to {@link TWITTER_TOKEN_URL}. */
  tokenUrl?: string;
  /** The same redirect URI used to start the flow (`/oauth/callback/twitter`). */
  redirectUri: string;
  /** Resolves client id/secret at call time (BYOK). */
  getAppCredentials: TwitterAppCredentialsProvider;
  /** Requested OAuth scopes. Defaults to {@link TWITTER_DEFAULT_SCOPES}. */
  scopes?: readonly string[];
  /** Injected transport. Defaults to global `fetch`. */
  fetchImpl?: FetchLike;
}

/** Read the PKCE code verifier from the router-supplied exchange metadata. */
function codeVerifierFrom(ctx?: ExchangeContext): string | undefined {
  const value = ctx?.metadata?.["codeVerifier"];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * X OAuth exchanger. Exchanges the auth code + PKCE verifier for an access
 * token (plus a refresh token when `offline.access` was granted).
 */
export class TwitterOAuthExchanger implements OAuthTokenExchanger {
  readonly platform = "twitter";
  /** The scopes this exchanger advertises for the authorize URL. */
  readonly scopes: readonly string[];
  private readonly tokenUrl: string;
  private readonly redirectUri: string;
  private readonly getAppCredentials: TwitterAppCredentialsProvider;
  private readonly fetchImpl: FetchLike;

  constructor(opts: TwitterOAuthExchangerOptions) {
    const tokenUrl = opts.tokenUrl ?? TWITTER_TOKEN_URL;
    assertSafeUrl(tokenUrl);
    this.scopes = opts.scopes ?? TWITTER_DEFAULT_SCOPES;
    this.tokenUrl = tokenUrl;
    this.redirectUri = opts.redirectUri;
    this.getAppCredentials = opts.getAppCredentials;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  }

  async exchangeCode(code: string, ctx?: ExchangeContext): Promise<ExchangedToken> {
    const app = await this.getAppCredentials();
    if (!app) throw new TwitterAppNotConfiguredError();

    const codeVerifier = codeVerifierFrom(ctx);
    if (!codeVerifier) throw new TwitterPkceMissingError();

    const form = new URLSearchParams();
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("redirect_uri", this.redirectUri);
    form.set("code_verifier", codeVerifier);
    form.set("client_id", app.clientId);

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded"
    };
    // Confidential client: authenticate with HTTP Basic instead of body-only.
    if (app.clientSecret) {
      const basic = Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64");
      headers["Authorization"] = `Basic ${basic}`;
    }

    const token = await readToken(
      await this.fetchImpl(this.tokenUrl, { method: "POST", headers, body: form })
    );

    return {
      accessToken: token.access_token as string,
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      ...(token.expires_in ? { expiresInSec: token.expires_in } : {})
    };
  }
}
