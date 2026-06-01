import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../db/index.js";
import { BrandVoiceRepository, normalizeRulebook } from "./rulebook-repository.js";

describe("normalizeRulebook", () => {
  it("trims, drops empties, and dedupes case-insensitively", () => {
    const result = normalizeRulebook({
      tone: "  warm  ",
      bannedWords: ["Spam", "spam", "", "  ", "Act Now"],
      exemplars: ["Hello", "hello", "World"]
    });
    expect(result.tone).toBe("warm");
    expect(result.bannedWords).toEqual(["Spam", "Act Now"]);
    expect(result.exemplars).toEqual(["Hello", "World"]);
  });
});

describe("BrandVoiceRepository", () => {
  let db: Database;
  let repo: BrandVoiceRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    repo = new BrandVoiceRepository(db, { now: () => 1234 });
  });

  afterEach(() => {
    db.close();
  });

  it("returns the empty default before anything is saved", () => {
    expect(repo.get()).toEqual({ tone: "", bannedWords: [], exemplars: [] });
  });

  it("persists and reloads a rulebook", () => {
    repo.save({ tone: "playful", bannedWords: ["spam"], exemplars: ["yo"] });
    expect(repo.get()).toEqual({ tone: "playful", bannedWords: ["spam"], exemplars: ["yo"] });
  });

  it("upserts in place — only one row ever exists", () => {
    repo.save({ tone: "first", bannedWords: [], exemplars: [] });
    repo.save({ tone: "second", bannedWords: ["x"], exemplars: ["e"] });
    expect(repo.get().tone).toBe("second");
    const count = db.prepare("SELECT COUNT(*) AS n FROM brand_voice_rulebook").get() as {
      n: number;
    };
    expect(count.n).toBe(1);
  });

  it("returns the normalised rulebook from save", () => {
    const saved = repo.save({ tone: " warm ", bannedWords: ["a", "a"], exemplars: [] });
    expect(saved).toEqual({ tone: "warm", bannedWords: ["a"], exemplars: [] });
  });
});
