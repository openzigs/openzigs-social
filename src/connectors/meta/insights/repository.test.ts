import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../../../db/index.js";
import { InsightsRepository } from "./repository.js";

describe("InsightsRepository", () => {
  let db: Database;
  let repo: InsightsRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    repo = new InsightsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates the platform_insights_raw table via migration 0003", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toContain("platform_insights_raw");
  });

  it("records and reads back a metric", () => {
    const r = repo.record({
      platform: "threads",
      objectType: "media",
      objectId: "m1",
      metric: "views",
      value: 100,
      capturedFor: "2025-01-01"
    });
    expect(r.id).toBeGreaterThan(0);
    expect(r.value).toBe(100);
    expect(r.metric).toBe("views");
  });

  it("is idempotent and updates the value in place on re-poll", () => {
    const key = {
      platform: "threads",
      objectType: "media" as const,
      objectId: "m1",
      metric: "views",
      capturedFor: "2025-01-01"
    };
    repo.record({ ...key, value: 100 });
    repo.record({ ...key, value: 150 });

    const all = repo.listByObject("threads", "media", "m1");
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe(150);
  });

  it("stores metadata and a null value", () => {
    const r = repo.record({
      platform: "facebook",
      objectType: "page",
      objectId: "p1",
      metric: "page_impressions",
      capturedFor: "2025-01-02",
      metadata: { breakdown: "organic" }
    });
    expect(r.value).toBeUndefined();
    expect(r.metadata).toEqual({ breakdown: "organic" });
  });

  it("records many in one call", () => {
    const out = repo.recordMany([
      {
        platform: "threads",
        objectType: "media",
        objectId: "m1",
        metric: "views",
        value: 1,
        capturedFor: "d1"
      },
      {
        platform: "threads",
        objectType: "media",
        objectId: "m1",
        metric: "likes",
        value: 2,
        capturedFor: "d1"
      }
    ]);
    expect(out).toHaveLength(2);
    expect(repo.listByObject("threads", "media", "m1")).toHaveLength(2);
  });

  it("tolerates corrupt metadata json on read", () => {
    repo.record({
      platform: "threads",
      objectType: "media",
      objectId: "m1",
      metric: "views",
      value: 1,
      capturedFor: "d1"
    });
    db.prepare("UPDATE platform_insights_raw SET metadata_json = '{bad'").run();
    expect(repo.listByObject("threads", "media", "m1")[0].metadata).toBeUndefined();
  });
});
