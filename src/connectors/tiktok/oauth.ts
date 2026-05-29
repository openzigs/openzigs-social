/**
 * TikTok OAuth token exchanger (#64).
 *
 * Implements the platform-service {@link OAuthTokenExchanger} port (#139). The
 * shared `createOAuthRouter` owns `/oauth/callback/:platform`, CSRF state, and
 * vault persistence — this connector supplies only the code→token exchange.
 *
 * TikTok uses an OAuth 2.0 authorization-code flow with credentials in the
 * form body (NOT Basic auth):
 *   `POST https://open.tiktokapis.com/v2/oauth/token/`
 *   body: `client_key=...&client_secret=...&code=...&grant_type=authorization_code&redirect_uri=...`
 * The response carries `access_token`, `expires_in`, `refresh_token`,
 * `refresh_token_expires_in`, `open_id`, and `scope`.
 *
 * ## v1 scope policy
 * TikTok content posting requires the `video.publish` (and `video.upload`)
 * scopes. Until the app passes TikTok's content-posting audit, posts are
 * constrained to PRIVATE (`SELF_ONLY`) — enforced in the publisher, not here.
 *
 * Security (OWASP): the client secret comes from the vault at runtime (BYOK),
 * never hardcoded and never logged; the token URL is SSRF-validated.
 */
import type { ExchangeContext, ExchangedToken, OAuthTokenExchanger } from "../../platform/index.js";
import { assertSafeUrl } from "../../server/setup/ssrf.js";
import { TikTokApiError, type FetchLike } from "./rest-client.js";

/** Default TikTok token endpoint (note the required trailing slash). */
export const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

/** v1 scopes: basic profile + video read/publish. */
export const TIKTOK_DEFAULT_SCOPES = [
  "user.info.basic",
  "video.list",
  "video.upload",
  "video.publish"
] as const;

/** Resolved TikTok app credentials (BYOK; sourced from the vault). */
export interface TikTokAppCredentials {
  clientKey: string;
  clientSecret: string;
}

export type TikTokAppCredentialsProvider = () => Promise<TikTokAppCredentials | undefined>;

export class TikTokAppNotConfiguredError extends Error {
  constructor() {
    super("tiktok app credentials not configured");
    this.name = "TikTokAppNotConfiguredError";
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  open_id?: string;
  error?: string;
  error_description?: string;
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
  if (!res.ok || (body.error && body.error !== "ok")) {
    throw new TikTokApiError(
      body.error_description ?? `tiktok token exchange failed (HTTP ${res.status})`,
      {
        httpStatus: res.status,
        code: body.error,
        transient: res.status === 429 || res.status >= 500
      }
    );
  }
  if (typeof body.access_token !== "string") {
    throw new TikTokApiError("tiktok token exchange returned no access_token", {
      httpStatus: res.status,
      transient: false
    });
  }
  return body;
}

export interface TikTokOAuthExchangerOptions {
  tokenUrl?: string;
  redirectUri: string;
  getAppCredentials: TikTokAppCredentialsProvider;
  scopes?: readonly string[];
  fetchImpl?: FetchLike;
}

export class TikTokOAuthExchanger implements OAuthTokenExchanger {
  readonly platform = "tiktok";
  readonly scopes: readonly string[];
  private readonly tokenUrl: string;
  private readonly redirectUri: string;
  private readonly getAppCredentials: TikTokAppCredentialsProvider;
  private readonly fetchImpl: FetchLike;

  constructor(opts: TikTokOAuthExchangerOptions) {
    const tokenUrl = opts.tokenUrl ?? TIKTOK_TOKEN_URL;
    assertSafeUrl(tokenUrl);
    this.tokenUrl = tokenUrl;
    this.scopes = opts.scopes ?? TIKTOK_DEFAULT_SCOPES;
    this.redirectUri = opts.redirectUri;
    this.getAppCredentials = opts.getAppCredentials;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  }

  async exchangeCode(code: string, _ctx?: ExchangeContext): Promise<ExchangedToken> {
    const app = await this.getAppCredentials();
    if (!app) throw new TikTokAppNotConfiguredError();

    const form = new URLSearchParams();
    form.set("client_key", app.clientKey);
    form.set("client_secret", app.clientSecret);
    form.set("code", code);
    form.set("grant_type", "authorization_code");
    form.set("redirect_uri", this.redirectUri);

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
