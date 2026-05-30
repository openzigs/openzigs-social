import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, openDb } from "../../db/index.js";
import { DlqRepository } from "./dlq.js";

let db: Database.Database;
let repo: DlqRepository;

beforeEach(() => {
  db = openDb({ path: ":memory:" });
  repo = new DlqRepository(db);
});

afterEach(() => {
  closeDb();
});

describe("DlqRepository", () => {
  it("falls back to bounded pagination for invalid limits", () => {
    for (let i = 0; i < 201; i++) {
      repo.land({
        platform: "twitter",
        opKind: "outbox.publish",
        payload: { n: i },
        lastError: "boom",
        attempts: i
      });
    }

    expect(repo.list({ limit: -1 })).toHaveLength(100);
    expect(repo.list({ limit: Number.POSITIVE_INFINITY })).toHaveLength(100);
  });
});
