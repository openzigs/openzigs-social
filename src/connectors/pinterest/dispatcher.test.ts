import { describe, expect, it, vi } from "vitest";

import type { DlqEntry, DlqInput, DlqRepository, RateLimitBroker } from "../../platform/index.js";
import { PinterestDispatcher } from "./dispatcher.js";
import { PinterestApiError } from "./rest-client.js";

function fakeBroker(results: { granted: boolean; reason?: string }[]): RateLimitBroker {
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
      return { id, ...input, payloadJson: "{}", createdAt: "now" } as unknown as DlqEntry;
    })
  } as unknown as DlqRepository;
  return { repo, landed };
}

const noSleep = { sleep: async () => undefined, random: () => 0 };

describe("PinterestDispatcher", () => {
  it("acquires then runs on success", async () => {
    const broker = fakeBroker([{ granted: true }]);
    const { repo } = fakeDlq();
    const dispatcher = new PinterestDispatcher({ broker, dlq: repo, retryOptions: noSleep });

    const outcome = await dispatcher.dispatch(
      { platform: "pinterest", opKind: "pinterest.pin.create", payload: {} },
      async () => ({ id: "p" })
    );

    expect(outcome).toEqual({ ok: true, value: { id: "p" }, attempts: 1 });
    expect(broker.acquire).toHaveBeenCalledWith("pinterest", { cost: 1, timeoutMs: 30_000 });
  });

  it("lands denied acquisitions in the DLQ", async () => {
    const broker = fakeBroker([{ granted: false, reason: "timeout" }]);
    const { repo, landed } = fakeDlq();
    const dispatcher = new PinterestDispatcher({ broker, dlq: repo });

    const run = vi.fn(async () => "never");
    const outcome = await dispatcher.dispatch(
      { platform: "pinterest", opKind: "pinterest.pin.create", payload: {} },
      run
    );

    expect(run).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    expect(landed[0]).toMatchObject({
      platform: "pinterest",
      lastError: "rate-limit denied: timeout"
    });
  });

  it("retries transient errors then succeeds", async () => {
    const broker = fakeBroker([{ granted: true }]);
    const { repo } = fakeDlq();
    const dispatcher = new PinterestDispatcher({ broker, dlq: repo, retryOptions: noSleep });

    let calls = 0;
    const outcome = await dispatcher.dispatch(
      { platform: "pinterest", opKind: "x", payload: {} },
      async () => {
        calls += 1;
        if (calls < 2) throw new PinterestApiError("rl", { httpStatus: 429, transient: true });
        return "done";
      }
    );

    expect(outcome).toEqual({ ok: true, value: "done", attempts: 2 });
  });

  it("lands terminal errors in the DLQ", async () => {
    const broker = fakeBroker([{ granted: true }]);
    const { repo, landed } = fakeDlq();
    const dispatcher = new PinterestDispatcher({ broker, dlq: repo, retryOptions: noSleep });

    const outcome = await dispatcher.dispatch(
      { platform: "pinterest", opKind: "x", payload: {} },
      async () => {
        throw new PinterestApiError("bad", { httpStatus: 400, transient: false });
      }
    );

    expect(outcome.ok).toBe(false);
    expect(landed).toHaveLength(1);
  });
});
