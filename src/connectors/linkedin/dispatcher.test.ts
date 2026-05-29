import { describe, expect, it, vi } from "vitest";

import type { DlqEntry, DlqInput, DlqRepository, RateLimitBroker } from "../../platform/index.js";
import { LinkedInDispatcher } from "./dispatcher.js";
import { LinkedInApiError } from "./rest-client.js";

interface AcquireResult {
  granted: boolean;
  reason?: string;
}

function fakeBroker(results: AcquireResult[]): RateLimitBroker {
  const queue = [...results];
  return {
    acquire: vi.fn(async () => queue.shift() ?? { granted: true })
  } as unknown as RateLimitBroker;
}

function fakeDlq(): { repo: DlqRepository; landed: DlqInput[] } {
  const landed: DlqInput[] = [];
  let id = 0;
  const repo = {
    land: vi.fn((input: DlqInput): DlqEntry => {
      landed.push(input);
      id += 1;
      return {
        id,
        platform: input.platform,
        opKind: input.opKind,
        payloadJson: JSON.stringify(input.payload ?? null),
        lastError: input.lastError,
        attempts: input.attempts,
        createdAt: "now"
      };
    })
  } as unknown as DlqRepository;
  return { repo, landed };
}

const noSleep = { sleep: async () => undefined, random: () => 0 };

describe("LinkedInDispatcher", () => {
  it("acquires a slot then runs the op on success", async () => {
    const broker = fakeBroker([{ granted: true }]);
    const { repo, landed } = fakeDlq();
    const dispatcher = new LinkedInDispatcher({ broker, dlq: repo, retryOptions: noSleep });

    const run = vi.fn(async () => ({ id: "ok" }));
    const outcome = await dispatcher.dispatch(
      { platform: "linkedin", opKind: "linkedin.publish", payload: { a: 1 } },
      run
    );

    expect(outcome).toEqual({ ok: true, value: { id: "ok" }, attempts: 1 });
    expect(broker.acquire).toHaveBeenCalledWith("linkedin", { cost: 1, timeoutMs: 30_000 });
    expect(landed).toHaveLength(0);
  });

  it("lands in the DLQ without running when the slot is denied", async () => {
    const broker = fakeBroker([{ granted: false, reason: "timeout" }]);
    const { repo, landed } = fakeDlq();
    const dispatcher = new LinkedInDispatcher({ broker, dlq: repo });

    const run = vi.fn(async () => "never");
    const outcome = await dispatcher.dispatch(
      { platform: "linkedin", opKind: "linkedin.publish", payload: { x: 1 } },
      run
    );

    expect(run).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.attempts).toBe(0);
      expect(outcome.dlqId).toBe(1);
    }
    expect(landed[0]).toMatchObject({
      platform: "linkedin",
      opKind: "linkedin.publish",
      lastError: "rate-limit denied: timeout",
      attempts: 0
    });
  });

  it("retries transient LinkedIn errors then succeeds", async () => {
    const broker = fakeBroker([{ granted: true }]);
    const { repo, landed } = fakeDlq();
    const dispatcher = new LinkedInDispatcher({ broker, dlq: repo, retryOptions: noSleep });

    let calls = 0;
    const run = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        throw new LinkedInApiError("rate limited", { httpStatus: 429, transient: true });
      }
      return "done";
    });

    const outcome = await dispatcher.dispatch(
      { platform: "linkedin", opKind: "linkedin.publish", payload: {} },
      run
    );

    expect(outcome).toEqual({ ok: true, value: "done", attempts: 3 });
    expect(landed).toHaveLength(0);
  });

  it("lands a terminal (non-transient) error in the DLQ", async () => {
    const broker = fakeBroker([{ granted: true }]);
    const { repo, landed } = fakeDlq();
    const dispatcher = new LinkedInDispatcher({ broker, dlq: repo, retryOptions: noSleep });

    const run = vi.fn(async () => {
      throw new LinkedInApiError("bad token", { httpStatus: 401, transient: false });
    });

    const outcome = await dispatcher.dispatch(
      { platform: "linkedin", opKind: "linkedin.publish", payload: { foo: "bar" } },
      run
    );

    expect(outcome.ok).toBe(false);
    expect(landed).toHaveLength(1);
    expect(landed[0]).toMatchObject({ platform: "linkedin", opKind: "linkedin.publish" });
  });
});
