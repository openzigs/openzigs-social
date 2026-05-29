/**
 * Connector registry + OAuth token-exchange port (#139).
 *
 * Real platform connectors (Instagram, X, LinkedIn, …) are built in the
 * connector epics (#53/#60/#66) and do not exist yet. The OAuth callback
 * router must not depend on any of them directly, so it dispatches through
 * this narrow port: a connector registers an {@link OAuthTokenExchanger} keyed
 * by its lower-case platform name, and the router looks it up by the
 * `:platform` route param.
 *
 * This keeps the platform-service layer testable now (with an in-memory fake
 * exchanger) and gives the connector epics a single, clear extension point.
 */

/** Token material returned by a connector after exchanging an auth code. */
export interface ExchangedToken {
  accessToken: string;
  refreshToken?: string;
  /** Seconds until the access token expires (connector-reported). */
  expiresInSec?: number;
  /** Absolute expiry as Unix epoch ms (takes precedence over expiresInSec). */
  expiresAt?: number;
}

/** Context handed to a connector during code exchange. */
export interface ExchangeContext {
  /** Optional metadata carried through the CSRF state record. */
  metadata?: Record<string, unknown>;
}

/**
 * Port a connector implements to exchange an OAuth `code` for tokens.
 * Implementations MUST throw on failure (the router maps that to a 502 without
 * leaking internals) and MUST NOT log secrets.
 */
export interface OAuthTokenExchanger {
  /** Lower-case platform key, e.g. `"instagram"`. */
  readonly platform: string;
  /** Exchange an authorisation code for tokens. Throws on failure. */
  exchangeCode(code: string, ctx?: ExchangeContext): Promise<ExchangedToken>;
}

const PLATFORM_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** Registry of {@link OAuthTokenExchanger}s keyed by platform. */
export class ConnectorRegistry {
  private readonly exchangers = new Map<string, OAuthTokenExchanger>();

  /** Register a connector's exchanger. Throws on duplicate / invalid platform. */
  register(exchanger: OAuthTokenExchanger): void {
    const platform = exchanger.platform.toLowerCase();
    if (!PLATFORM_RE.test(platform)) {
      throw new Error(`invalid platform key: ${exchanger.platform}`);
    }
    if (this.exchangers.has(platform)) {
      throw new Error(`exchanger already registered for platform: ${platform}`);
    }
    this.exchangers.set(platform, exchanger);
  }

  has(platform: string): boolean {
    return this.exchangers.has(platform.toLowerCase());
  }

  get(platform: string): OAuthTokenExchanger | undefined {
    return this.exchangers.get(platform.toLowerCase());
  }

  /** Registered platform keys. */
  platforms(): string[] {
    return [...this.exchangers.keys()];
  }
}
