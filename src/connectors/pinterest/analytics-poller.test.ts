import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import { InsightsRepository } from "../meta/insights/repository.js";
import { PinterestAnalyticsPoller } from "./analytics-poller.js";
import type { PinterestDispatcher } from "./dispatcher.js";
import type { PinterestRestClient } from "./rest-client.js";

function passthroughDispatcher(): PinterestDispatcher {
  return {
    dispatch: vi.fn(async (_op: unknown, run: () => Promise<unknown>) => ({
      ok: true,
      value: await run(),
      attempts: 1
    }))
  } as unknown as PinterestDispatcher;
}

function fakeClient(responses: unknown[]): {
  client: PinterestRestClient;
  get: ReturnType<typeof vi.fn>;
} {
  const queue = [...responses];
  const get = vi.fn(async () => queue.shift() ?? {});
  return { client: { get } as unknown as PinterestRestClient, get };
}

const PIN = "pin-1";
const FIXED = new Date("2025-03-04T00:00:00Z");

describe("PinterestAnalyticsPoller", () => {
  let db: Database;
  let insights: InsightsRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    insights = new InsightsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("records summary metrics as lower-cased pin metrics", async () => {
    const { client } = fakeClient([
      { all: { summary_metrics: { IMPRESSION: 100, PIN_CLICK: 5, SAVE: 2 } } }
    ]);
    const poller = new PinterestAnalyticsPoller({
      client,
      insights,
      dispatcher: passthroughDispatcher(),
      now: () => FIXED
    });

    const count = await poller.pollPin("tok", PIN);

    expect(count).toBe(3);
    const rows = insights.listByObject("pinterest", "pin", PIN);
    const byMetric = Object.fromEntries(rows.map((r) => [r.metric, r.value]));
    expect(byMetric.impression).toBe(100);
    expect(byMetric.pin_click).toBe(5);
    expect(byMetric.save).toBe(2);
    expect(rows[0]?.capturedFor).toBe("2025-03-04");
  });

  it("requests the default metric types and date window", async () => {
    const { client, get } = fakeClient([{ all: { summary_metrics: {} } }]);
    const poller = new PinterestAnalyticsPoller({
      client,
      insights,
      dispatcher: passthroughDispatcher(),
      now: () => FIXED
    });

    await poller.pollPin("tok", PIN);

    const opts = get.mock.calls[0]![1] as { query: Record<string, string> };
    expect(opts.query.metric_types).toBe("IMPRESSION,PIN_CLICK,SAVE");
    expect(opts.query.start_date).toBe("2025-03-04");
    expect(opts.query.end_date).toBe("2025-03-04");
  });

  it("honours an explicit date window and metric list", async () => {
    const { client, get } = fakeClient([{ all: { summary_metrics: { SAVE: 1 } } }]);
    const poller = new PinterestAnalyticsPoller({
      client,
      insights,
      dispatcher: passthroughDispatcher(),
      now: () => FIXED
    });

    await poller.pollPin("tok", PIN, {
      startDate: "2025-01-01",
      endDate: "2025-01-07",
      metricTypes: ["SAVE"]
    });

    const opts = get.mock.calls[0]![1] as { query: Record<string, string> };
    expect(opts.query.metric_types).toBe("SAVE");
    expect(opts.query.start_date).toBe("2025-01-01");
    expect(insights.listByObject("pinterest", "pin", PIN)[0]?.capturedFor).toBe("2025-01-07");
  });

  it("records nothing when there are no summary metrics", async () => {
    const { client } = fakeClient([{}]);
    const poller = new PinterestAnalyticsPoller({
      client,
      insights,
      dispatcher: passthroughDispatcher(),
      now: () => FIXED
    });
    expect(await poller.pollPin("tok", PIN)).toBe(0);
  });
});
