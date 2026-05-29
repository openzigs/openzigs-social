/**
 * Meta OAuth token exchangers (#54 Instagram, #57 Facebook, #135 Threads).
 *
 * These implement the platform-service {@link OAuthTokenExchanger} port (#139):
 * the shared `createOAuthRouter` owns `/oauth/callback/:platform`, CSRF state,
 * and vault persistence — a connector only supplies the code→token exchange.
 *
 * Two flavours share most of the flow but differ in host + request shape:
 *   - **Facebook / Instagram** (`graph.facebook.com`): `GET /oauth/access_token`
 *     with `client_id|redirect_uri|client_secret|code`, then an optional
 *     `fb_exchange_token` upgrade to a long-lived (~60-day) token.
 *   - **Threads** (`graph.threads.net`): `POST /oauth/access_token` form with
 *     `grant_type=authorization_code`, then a `th_exchange_token` upgrade.
 *
 * Security (OWASP): the app secret comes from the vault at runtime (BYOK),
 * never hardcoded and never logged; token responses are returned to the router
 * (which encrypts them) and never written to a log line. The token URL is
 * SSRF-validated.
 */
import type { ExchangeContext, ExchangedToken, OAuthTokenExchanger } from "../../platform/index.js";
import { assertSafeUrl } from "../../server/setup/ssrf.js";
import {
  MetaGraphError,
  type FetchLike,
  type GraphParamValue,
  type MetaErrorEnvelope
} from "./graph-client.js";

/** Resolved Meta app credentials (BYOK; sourced from the vault). */
export interface MetaAppCredentials {
  appId: string;
  appSecret: string;
}

/** Async resolver for Meta app credentials. Returns `undefined` when unset. */
export type MetaAppCredentialsProvider = () => Promise<MetaAppCredentials | undefined>;

/** Raw token-endpoint success body (fields we read). */
interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  user_id?: string | number;
}

/** Thrown when the connector is asked to exchange a code without app creds. */
export class MetaAppNotConfiguredError extends Error {
  constructor(platform: string) {
    super(`meta app credentials not configured for ${platform}`);
    this.name = "MetaAppNotConfiguredError";
  }
}

function buildUrl(base: string, params: Record<string, GraphParamValue>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function readToken(res: Response): Promise<TokenResponse> {
  const text = await res.text();
  let body: (TokenResponse & MetaErrorEnvelope) | Record<string, never> = {};
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as TokenResponse & MetaErrorEnvelope;
    } catch {
      body = {};
    }
  }
  if (!res.ok || (body as MetaErrorEnvelope).error) {
    const err = (body as MetaErrorEnvelope).error;
    throw new MetaGraphError(err?.message ?? `token exchange failed (HTTP ${res.status})`, {
      httpStatus: res.status,
      code: err?.code,
      subcode: err?.error_subcode,
      type: err?.type,
      fbtraceId: err?.fbtrace_id,
      transient: res.status === 429 || res.status >= 500
    });
  }
  if (typeof (body as TokenResponse).access_token !== "string") {
    throw new MetaGraphError("token exchange returned no access_token", {
      httpStatus: res.status,
      transient: false
    });
  }
  return body as TokenResponse;
}

export interface MetaOAuthExchangerOptions {
  /** Lower-case platform key, e.g. `"instagram"` / `"facebook"`. */
  platform: string;
  /** Token endpoint, e.g. `https://graph.facebook.com/v25.0/oauth/access_token`. */
  tokenUrl: string;
  /** The same redirect URI used to start the flow (`/oauth/callback/:platform`). */
  redirectUri: string;
  /** Resolves app id/secret at call time (BYOK). */
  getAppCredentials: MetaAppCredentialsProvider;
  /** Injected transport. Defaults to global `fetch`. */
  fetchImpl?: FetchLike;
  /**
   * Optional long-lived upgrade endpoint
   * (`.../oauth/access_token` for FB; `.../access_token` for Threads).
   */
  longLivedUrl?: string;
}

/**
 * Facebook / Instagram OAuth exchanger. Exchanges the auth code for a
 * short-lived token via `GET /oauth/access_token`, then (when configured)
 * upgrades it to a long-lived token via `grant_type=fb_exchange_token`.
 */
export class FacebookOAuthExchanger implements OAuthTokenExchanger {
  readonly platform: string;
  private readonly tokenUrl: string;
  private readonly redirectUri: string;
  private readonly getAppCredentials: MetaAppCredentialsProvider;
  private readonly fetchImpl: FetchLike;
  private readonly longLivedUrl?: string;

  constructor(opts: MetaOAuthExchangerOptions) {
    this.platform = opts.platform.toLowerCase();
    assertSafeUrl(opts.tokenUrl);
    if (opts.longLivedUrl) assertSafeUrl(opts.longLivedUrl);
    this.tokenUrl = opts.tokenUrl;
    this.redirectUri = opts.redirectUri;
    this.getAppCredentials = opts.getAppCredentials;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
    this.longLivedUrl = opts.longLivedUrl;
  }

  async exchangeCode(code: string, _ctx?: ExchangeContext): Promise<ExchangedToken> {
    const app = await this.getAppCredentials();
    if (!app) throw new MetaAppNotConfiguredError(this.platform);

    const shortUrl = buildUrl(this.tokenUrl, {
      client_id: app.appId,
      client_secret: app.appSecret,
      redirect_uri: this.redirectUri,
      code
    });
    const short = await readToken(await this.fetchImpl(shortUrl, { method: "GET" }));

    let token = short.access_token as string;
    let expiresInSec = short.expires_in;

    if (this.longLivedUrl) {
      const longUrl = buildUrl(this.longLivedUrl, {
        grant_type: "fb_exchange_token",
        client_id: app.appId,
        client_secret: app.appSecret,
        fb_exchange_token: token
      });
      const long = await readToken(await this.fetchImpl(longUrl, { method: "GET" }));
      token = long.access_token as string;
      expiresInSec = long.expires_in ?? expiresInSec;
    }

    return { accessToken: token, ...(expiresInSec ? { expiresInSec } : {}) };
  }
}

/**
 * Threads OAuth exchanger. `POST /oauth/access_token` for the short-lived
 * token, then a `th_exchange_token` GET upgrade to the long-lived token.
 */
export class ThreadsOAuthExchanger implements OAuthTokenExchanger {
  readonly platform = "threads";
  private readonly tokenUrl: string;
  private readonly redirectUri: string;
  private readonly getAppCredentials: MetaAppCredentialsProvider;
  private readonly fetchImpl: FetchLike;
  private readonly longLivedUrl?: string;

  constructor(opts: Omit<MetaOAuthExchangerOptions, "platform">) {
    assertSafeUrl(opts.tokenUrl);
    if (opts.longLivedUrl) assertSafeUrl(opts.longLivedUrl);
    this.tokenUrl = opts.tokenUrl;
    this.redirectUri = opts.redirectUri;
    this.getAppCredentials = opts.getAppCredentials;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
    this.longLivedUrl = opts.longLivedUrl;
  }

  async exchangeCode(code: string, _ctx?: ExchangeContext): Promise<ExchangedToken> {
    const app = await this.getAppCredentials();
    if (!app) throw new MetaAppNotConfiguredError(this.platform);

    const form = new URLSearchParams();
    form.set("client_id", app.appId);
    form.set("client_secret", app.appSecret);
    form.set("grant_type", "authorization_code");
    form.set("redirect_uri", this.redirectUri);
    form.set("code", code);
    const short = await readToken(
      await this.fetchImpl(this.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form
      })
    );

    let token = short.access_token as string;
    let expiresInSec = short.expires_in;

    if (this.longLivedUrl) {
      const longUrl = buildUrl(this.longLivedUrl, {
        grant_type: "th_exchange_token",
        client_secret: app.appSecret,
        access_token: token
      });
      const long = await readToken(await this.fetchImpl(longUrl, { method: "GET" }));
      token = long.access_token as string;
      expiresInSec = long.expires_in ?? expiresInSec;
    }

    return { accessToken: token, ...(expiresInSec ? { expiresInSec } : {}) };
  }
}
