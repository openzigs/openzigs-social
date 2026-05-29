/**
 * Pinterest v5 OAuth token exchanger (#63).
 *
 * Implements the platform-service {@link OAuthTokenExchanger} port (#139). The
 * shared `createOAuthRouter` owns `/oauth/callback/:platform`, CSRF state, and
 * vault persistence — this connector supplies only the code→token exchange.
 *
 * Pinterest v5 uses an OAuth 2.0 authorization-code flow with the app id/secret
 * sent as HTTP **Basic** auth (not in the body):
 *   `POST https://api.pinterest.com/v5/oauth/token`
 *   `Authorization: Basic base64(appId:appSecret)`
 *   body: `grant_type=authorization_code&code=...&redirect_uri=...`
 * The response carries `access_token`, `expires_in`, `refresh_token`, and
 * `refresh_token_expires_in`.
 *
 * Security (OWASP): the app secret comes from the vault at runtime (BYOK),
 * never hardcoded and never logged; the token URL is SSRF-validated.
 */
import type { ExchangeContext, ExchangedToken, OAuthTokenExchanger } from "../../platform/index.js";
import { assertSafeUrl } from "../../server/setup/ssrf.js";
import { PinterestApiError, type FetchLike } from "./rest-client.js";

/** Default Pinterest token endpoint. */
export const PINTEREST_TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";

/** v1 scopes: read/write pins + boards, plus user-account read for analytics. */
export const PINTEREST_DEFAULT_SCOPES = [
  "boards:read",
  "boards:write",
  "pins:read",
  "pins:write",
  "user_accounts:read"
] as const;

/** Resolved Pinterest app credentials (BYOK; sourced from the vault). */
export interface PinterestAppCredentials {
  appId: string;
  appSecret: string;
}

export type PinterestAppCredentialsProvider = () => Promise<PinterestAppCredentials | undefined>;

export class PinterestAppNotConfiguredError extends Error {
  constructor() {
    super("pinterest app credentials not configured");
    this.name = "PinterestAppNotConfiguredError";
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
}

function basicAuth(appId: string, appSecret: string): string {
  return `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`;
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
    throw new PinterestApiError(`pinterest token exchange failed (HTTP ${res.status})`, {
      httpStatus: res.status,
      transient: res.status === 429 || res.status >= 500
    });
  }
  if (typeof body.access_token !== "string") {
    throw new PinterestApiError("pinterest token exchange returned no access_token", {
      httpStatus: res.status,
      transient: false
    });
  }
  return body;
}

export interface PinterestOAuthExchangerOptions {
  tokenUrl?: string;
  redirectUri: string;
  getAppCredentials: PinterestAppCredentialsProvider;
  scopes?: readonly string[];
  fetchImpl?: FetchLike;
}

export class PinterestOAuthExchanger implements OAuthTokenExchanger {
  readonly platform = "pinterest";
  readonly scopes: readonly string[];
  private readonly tokenUrl: string;
  private readonly redirectUri: string;
  private readonly getAppCredentials: PinterestAppCredentialsProvider;
  private readonly fetchImpl: FetchLike;

  constructor(opts: PinterestOAuthExchangerOptions) {
    const tokenUrl = opts.tokenUrl ?? PINTEREST_TOKEN_URL;
    assertSafeUrl(tokenUrl);
    this.tokenUrl = tokenUrl;
    this.scopes = opts.scopes ?? PINTEREST_DEFAULT_SCOPES;
    this.redirectUri = opts.redirectUri;
    this.getAppCredentials = opts.getAppCredentials;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  }

  async exchangeCode(code: string, _ctx?: ExchangeContext): Promise<ExchangedToken> {
    const app = await this.getAppCredentials();
    if (!app) throw new PinterestAppNotConfiguredError();

    const form = new URLSearchParams();
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("redirect_uri", this.redirectUri);

    const token = await readToken(
      await this.fetchImpl(this.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: basicAuth(app.appId, app.appSecret)
        },
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
