import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../../db/index.js";
import { WebhookEventStore } from "./event-store.js";

describe("WebhookEventStore", () => {
  let db: Database;
  let store: WebhookEventStore;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    store = new WebhookEventStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it("records a new event once and treats redelivery as a duplicate", () => {
    expect(store.recordIfNew("instagram", "evt-1")).toBe(true);
    expect(store.recordIfNew("instagram", "evt-1")).toBe(false);
    expect(store.seen("instagram", "evt-1")).toBe(true);
  });

  it("scopes dedupe by platform", () => {
    expect(store.recordIfNew("instagram", "evt-1")).toBe(true);
    expect(store.recordIfNew("x", "evt-1")).toBe(true);
    expect(store.seen("x", "evt-1")).toBe(true);
  });

  it("reports unseen events as not seen", () => {
    expect(store.seen("instagram", "nope")).toBe(false);
  });
});
