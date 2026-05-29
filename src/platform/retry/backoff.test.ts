import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import {
  computeBackoffMs,
  dispatchWithDlq,
  retry,
  RetryExhaustedError,
  DEFAULT_BASE_DELAY_MS
} from "./backoff.js";
import { DlqRepository } from "./dlq.js";

/** Deterministic random that always returns 0.5 → jitter factor exactly 1.0. */
const noJitter = () => 0.5;

describe("computeBackoffMs", () => {
  it("produces base*multiplier^(attempt-1) with no jitter at random()=0.5", () => {
    const params = { baseDelayMs: 1000, multiplier: 2, jitterRatio: 0.25, random: noJitter };
    expect(computeBackoffMs(1, params)).toBe(1000);
    expect(computeBackoffMs(2, params)).toBe(2000);
    expect(computeBackoffMs(3, params)).toBe(4000);
    expect(computeBackoffMs(4, params)).toBe(8000);
  });

  it("applies the full negative jitter at random()=0", () => {
    const params = { baseDelayMs: 1000, multiplier: 2, jitterRatio: 0.25, random: () => 0 };
    // jitter factor = 1 + (0*2 - 1)*0.25 = 0.75
    expect(computeBackoffMs(1, params)).toBe(750);
  });

  it("applies near-full positive jitter as random()→1", () => {
    const params = {
      baseDelayMs: 1000,
      multiplier: 2,
      jitterRatio: 0.25,
      random: () => 0.999999
    };
    // jitter factor ≈ 1 + (~1)*0.25 ≈ 1.25
    expect(computeBackoffMs(1, params)).toBe(1250);
  });
});

describe("retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately on first success without sleeping", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await retry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures up to maxAttempts then throws RetryExhaustedError", async () => {
    const fn = vi.fn(async () => {
      throw new Error("503 transient");
    });
    const onRetry = vi.fn();
    const promise = retry(fn, {
      isTransient: () => true,
      random: noJitter,
      onRetry
    });
    // Attach the rejection handler before draining timers so the eventual
    // rejection is never momentarily unhandled.
    const assertion = expect(promise).rejects.toBeInstanceOf(RetryExhaustedError);
    // Drain all scheduled timers.
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(5);
    // 4 retries scheduled between 5 attempts.
    expect(onRetry).toHaveBeenCalledTimes(4);
    expect(onRetry.mock.calls[0]?.[0].delayMs).toBe(DEFAULT_BASE_DELAY_MS);
  });

  it("eventually succeeds after transient failures", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("temporary");
      return "recovered";
    });
    const promise = retry(fn, { isTransient: () => true, random: noJitter });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("fails immediately (no retry) on a non-transient error", async () => {
    const fn = vi.fn(async () => {
      throw new Error("400 bad request");
    });
    const promise = retry(fn, { isTransient: () => false });
    await expect(promise).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("waits the computed delay before retrying", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    const fn = async () => {
      calls += 1;
      if (calls < 2) throw new Error("retry me");
      return "done";
    };
    await retry(fn, { isTransient: () => true, random: noJitter, sleep });
    expect(sleep).toHaveBeenCalledWith(DEFAULT_BASE_DELAY_MS);
  });
});

describe("dispatchWithDlq", () => {
  let db: Database;
  let dlq: DlqRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    dlq = new DlqRepository(db);
  });
  afterEach(() => {
    db.close();
  });

  it("returns ok on success and does not write to the DLQ", async () => {
    const outcome = await dispatchWithDlq(
      { platform: "x", opKind: "publish", payload: { id: 1 } },
      async () => "sent",
      dlq
    );
    expect(outcome).toEqual({ ok: true, value: "sent", attempts: 1 });
    expect(dlq.list()).toHaveLength(0);
  });

  it("lands a DLQ row on terminal failure with attempts + last error", async () => {
    vi.useFakeTimers();
    const run = async () => {
      throw new Error("network down");
    };
    const promise = dispatchWithDlq(
      { platform: "instagram", opKind: "dm.send", payload: { to: "alice" } },
      run,
      dlq,
      { isTransient: () => true, random: noJitter }
    );
    await vi.runAllTimersAsync();
    const outcome = await promise;
    vi.useRealTimers();

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.attempts).toBe(5);
      expect(outcome.dlqId).toBeGreaterThan(0);
    }
    const rows = dlq.list({ platform: "instagram" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.opKind).toBe("dm.send");
    expect(rows[0]?.lastError).toContain("network down");
    expect(rows[0]?.attempts).toBe(5);
    expect(JSON.parse(rows[0]?.payloadJson ?? "{}")).toEqual({ to: "alice" });
  });

  it("lands a DLQ row immediately for a non-retryable error (attempts=1)", async () => {
    const outcome = await dispatchWithDlq(
      { platform: "x", opKind: "publish", payload: null },
      async () => {
        throw new Error("403 forbidden");
      },
      dlq,
      { isTransient: () => false }
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.attempts).toBe(1);
    expect(dlq.list()).toHaveLength(1);
  });
});

describe("DlqRepository", () => {
  let db: Database;
  let dlq: DlqRepository;
  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    dlq = new DlqRepository(db);
  });
  afterEach(() => db.close());

  it("lands, reads, and lists by platform", () => {
    const a = dlq.land({
      platform: "x",
      opKind: "k",
      payload: { a: 1 },
      lastError: "e",
      attempts: 3
    });
    dlq.land({ platform: "ig", opKind: "k2", payload: {}, lastError: "e2", attempts: 1 });
    expect(dlq.get(a.id)?.platform).toBe("x");
    expect(dlq.get(9999)).toBeUndefined();
    expect(dlq.list({ platform: "x" })).toHaveLength(1);
    expect(dlq.list()).toHaveLength(2);
  });
});
