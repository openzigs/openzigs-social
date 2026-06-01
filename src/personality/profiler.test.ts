import { describe, expect, it } from "vitest";

import { scoreVoice } from "./profiler.js";
import { EMPTY_RULEBOOK, type BrandVoiceRulebook } from "./types.js";

const RULEBOOK: BrandVoiceRulebook = {
  tone: "warm concise",
  bannedWords: ["spam", "act now"],
  exemplars: ["Thanks so much for reaching out"]
};

describe("scoreVoice", () => {
  it("returns a zeroed score for an empty rulebook", () => {
    const score = scoreVoice("anything at all", EMPTY_RULEBOOK);
    expect(score.toneMatch).toBe(0);
    expect(score.score).toBe(0);
    expect(score.bannedWordPenalty).toBe(0);
    expect(score.bannedHits).toEqual([]);
  });

  it("scores full tone coverage as 1", () => {
    const score = scoreVoice("warm concise thanks so much for reaching out", RULEBOOK);
    expect(score.toneMatch).toBe(1);
    expect(score.score).toBe(1);
  });

  it("weights tone-descriptor tokens double the exemplar tokens", () => {
    // vocab weights: warm=2, concise=2, thanks=1, so=1, much=1, for=1,
    // reaching=1, out=1 → total = 10. "warm thanks" matches 2 + 1 = 3.
    const score = scoreVoice("warm thanks", RULEBOOK);
    expect(score.toneMatch).toBeCloseTo(0.3, 5);
    expect(score.score).toBeCloseTo(0.3, 5);
  });

  it("vetoes the composite score to 0 on any banned word, keeping toneMatch", () => {
    const score = scoreVoice("warm spam everywhere", RULEBOOK);
    expect(score.bannedHits).toEqual(["spam"]);
    expect(score.bannedWordPenalty).toBe(1);
    expect(score.score).toBe(0);
    // toneMatch is preserved for explainability (warm = 2 / 10).
    expect(score.toneMatch).toBeCloseTo(0.2, 5);
  });

  it("matches multi-word banned phrases case-insensitively", () => {
    const score = scoreVoice("Please ACT  NOW before it ends", RULEBOOK);
    expect(score.bannedHits).toEqual(["act now"]);
    expect(score.score).toBe(0);
  });

  it("ignores partial-word collisions in tone matching", () => {
    // "warmth" should not satisfy the "warm" token (set membership, not substring).
    const score = scoreVoice("warmth", { tone: "warm", bannedWords: [], exemplars: [] });
    expect(score.toneMatch).toBe(0);
  });
});
