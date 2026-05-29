/**
 * OAuth CSRF state store (#139).
 *
 * The `state` parameter in an OAuth authorisation flow is the anti-CSRF token.
 * This store mints cryptographically-random, single-use, time-bounded state
 * values bound to a platform and validates them on the callback:
 *
 *   - **opaque** — 32 bytes of CSPRNG entropy, base64url-encoded.
 *   - **single-use** — `consume` deletes the record, so a replayed callback
 *     with the same state fails.
 *   - **time-bounded** — records expire after `ttlMs`; expired records are
 *     rejected and pruned.
 *   - **constant-time compare** — lookup is by exact key, and the optional
 *     value check uses `timingSafeEqual`.
 *
 * State is kept server-side (in-memory by default). The clock is injectable so
 * expiry is deterministic under fake timers.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

/** Default state lifetime: 10 minutes is plenty for an interactive consent. */
export const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;

/** A minted state record. */
export interface StateRecord {
  platform: string;
  state: string;
  /** Optional caller context echoed back on consume (e.g. return path). */
  metadata?: Record<string, unknown>;
  issuedAt: number;
  expiresAt: number;
}

export interface OAuthStateStoreOptions {
  /** State lifetime in ms. Default 10 minutes. */
  ttlMs?: number;
  /** Injectable clock. Default `Date.now`. */
  now?: () => number;
}

/** Constant-time string equality (length-safe). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export class OAuthStateStore {
  private readonly records = new Map<string, StateRecord>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(opts: OAuthStateStoreOptions = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_STATE_TTL_MS;
    this.now = opts.now ?? Date.now;
  }

  /** Mint a new opaque state bound to `platform`. Returns the state string. */
  issue(platform: string, metadata?: Record<string, unknown>): string {
    const state = randomBytes(32).toString("base64url");
    const issuedAt = this.now();
    this.records.set(state, {
      platform,
      state,
      metadata,
      issuedAt,
      expiresAt: issuedAt + this.ttlMs
    });
    return state;
  }

  /**
   * Validate + consume a state for `platform`. Returns the record on success
   * (and removes it so it can never be replayed), or `undefined` when the
   * state is unknown, expired, or bound to a different platform.
   */
  consume(platform: string, state: string): StateRecord | undefined {
    if (typeof state !== "string" || state.length === 0) return undefined;
    const record = this.records.get(state);
    if (!record) return undefined;
    // Single-use: remove regardless of outcome so a failed match can't be retried.
    this.records.delete(state);
    if (record.expiresAt <= this.now()) return undefined;
    if (!safeEqual(record.platform, platform)) return undefined;
    if (!safeEqual(record.state, state)) return undefined;
    return record;
  }

  /** Remove expired records (housekeeping). Returns the count pruned. */
  prune(): number {
    const ts = this.now();
    let pruned = 0;
    for (const [key, record] of this.records) {
      if (record.expiresAt <= ts) {
        this.records.delete(key);
        pruned += 1;
      }
    }
    return pruned;
  }

  /** Number of live (un-consumed) records. */
  get size(): number {
    return this.records.size;
  }
}
