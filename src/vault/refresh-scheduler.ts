/**
 * OAuth token refresh scheduler.
 *
 * Per acceptance criteria (#131):
 *   - vault tracks `accessToken`, `refreshToken`, `expiresAt`
 *   - scheduler tick scans for tokens inside the refresh window
 *   - on success: atomic vault replace
 *   - on hard failure: mark `needsReconsent`, emit `token:expired`, log
 *
 * Connectors aren't built yet, so refresh handlers register through a
 * `RefreshRegistry`. The Telegram alert path is stubbed — see #47.
 */
import { EventEmitter } from "node:events";

import type { CredentialVault, OAuthCredential } from "../vault/index.js";

export interface RefreshResult {
  accessToken: string;
  refreshToken?: string;
  /** Unix epoch ms when the new accessToken expires. */
  expiresAt?: number;
}

export type RefreshHandler = (current: OAuthCredential) => Promise<RefreshResult>;

export class RefreshRegistry {
  private readonly handlers = new Map<string, RefreshHandler>();

  register(platform: string, handler: RefreshHandler): void {
    this.handlers.set(platform, handler);
  }

  get(platform: string): RefreshHandler | undefined {
    return this.handlers.get(platform);
  }

  has(platform: string): boolean {
    return this.handlers.has(platform);
  }
}

export interface SchedulerOptions {
  /** How close to expiry (ms) before we try to refresh. Default 24h. */
  refreshWindowMs?: number;
  /** Override the clock (tests). */
  now?: () => number;
}

export interface TokenExpiredEvent {
  platform: string;
  reason: "no-handler" | "no-refresh-token" | "handler-error";
  error?: string;
}

export interface TokenRefreshedEvent {
  platform: string;
  expiresAt?: number;
}

export const DEFAULT_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

export class TokenRefreshScheduler extends EventEmitter {
  private readonly refreshWindowMs: number;
  private readonly now: () => number;

  constructor(
    private readonly vault: CredentialVault,
    private readonly registry: RefreshRegistry,
    opts: SchedulerOptions = {}
  ) {
    super();
    this.refreshWindowMs = opts.refreshWindowMs ?? DEFAULT_REFRESH_WINDOW_MS;
    this.now = opts.now ?? Date.now;
  }

  /**
   * One scheduler iteration. Iterates all OAuth credentials and attempts a
   * refresh for any inside the refresh window. Returns counts for observation.
   */
  async tick(): Promise<{ checked: number; refreshed: number; expired: number }> {
    const all = await this.vault.listOAuth();
    let refreshed = 0;
    let expired = 0;
    const platforms = Object.keys(all);
    for (const platform of platforms) {
      const cred = all[platform]!;
      if (cred.needsReconsent) continue;
      if (typeof cred.expiresAt !== "number") continue;
      const remaining = cred.expiresAt - this.now();
      if (remaining > this.refreshWindowMs) continue;

      const handler = this.registry.get(platform);
      if (!handler) {
        await this.markExpired(platform, "no-handler");
        expired += 1;
        continue;
      }
      if (!cred.refreshToken) {
        await this.markExpired(platform, "no-refresh-token");
        expired += 1;
        continue;
      }
      try {
        const result = await handler(cred);
        await this.vault.updateOAuth(platform, {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken ?? cred.refreshToken,
          expiresAt: result.expiresAt,
          needsReconsent: false
        });
        const evt: TokenRefreshedEvent = { platform, expiresAt: result.expiresAt };
        this.emit("token:refreshed", evt);
        refreshed += 1;
      } catch (err) {
        await this.markExpired(platform, "handler-error", String((err as Error).message ?? err));
        expired += 1;
      }
    }
    return { checked: platforms.length, refreshed, expired };
  }

  private async markExpired(
    platform: string,
    reason: TokenExpiredEvent["reason"],
    error?: string
  ): Promise<void> {
    await this.vault.updateOAuth(platform, { needsReconsent: true });
    const evt: TokenExpiredEvent = { platform, reason, ...(error ? { error } : {}) };
    this.emit("token:expired", evt);
  }
}
