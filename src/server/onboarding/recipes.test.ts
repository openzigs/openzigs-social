import { describe, expect, it } from "vitest";

import {
  STARTER_RECIPES,
  isRecipeId,
  listRecipes,
  mergeBrandVoice,
  parseBrandVoiceImport
} from "./recipes.js";

describe("starter recipes", () => {
  it("lists three presets in canonical order", () => {
    expect(listRecipes().map((r) => r.id)).toEqual(["creator", "small-biz", "agency"]);
  });

  it("each preset has tone, exemplars, and suggested platforms", () => {
    for (const recipe of listRecipes()) {
      expect(recipe.tone.length).toBeGreaterThan(0);
      expect(recipe.exemplars.length).toBeGreaterThan(0);
      expect(recipe.suggestedPlatforms.length).toBeGreaterThan(0);
      expect(recipe.cadencePerWeek).toBeGreaterThan(0);
    }
  });

  it("narrows known and rejects unknown recipe ids", () => {
    expect(isRecipeId("agency")).toBe(true);
    expect(isRecipeId("nope")).toBe(false);
  });
});

describe("parseBrandVoiceImport", () => {
  it("parses a JSON array of exemplars", () => {
    const result = parseBrandVoiceImport('["one", "two", 3]', "json");
    expect(result).toEqual({ bannedWords: [], exemplars: ["one", "two"] });
  });

  it("parses a JSON object with tone, banned words, and exemplars", () => {
    const result = parseBrandVoiceImport(
      JSON.stringify({ tone: "  bold  ", bannedWords: ["x"], exemplars: ["a", "b"] }),
      "json"
    );
    expect(result).toEqual({ tone: "bold", bannedWords: ["x"], exemplars: ["a", "b"] });
  });

  it("ignores a JSON object without recognized fields", () => {
    expect(parseBrandVoiceImport("{}", "json")).toEqual({ bannedWords: [], exemplars: [] });
  });

  it("parses CSV with one exemplar per line and strips a header + quotes", () => {
    const csv = 'exemplar\n"hello world"\nsecond line';
    expect(parseBrandVoiceImport(csv, "csv")).toEqual({
      bannedWords: [],
      exemplars: ["hello world", "second line"]
    });
  });

  it("throws on empty content", () => {
    expect(() => parseBrandVoiceImport("   ", "json")).toThrow(/empty import/);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseBrandVoiceImport("{bad", "json")).toThrow(/invalid JSON/);
  });

  it("throws on an unsupported JSON scalar", () => {
    expect(() => parseBrandVoiceImport("42", "json")).toThrow(/unsupported JSON shape/);
  });
});

describe("mergeBrandVoice", () => {
  const base = { tone: "calm", bannedWords: ["spam"], exemplars: ["existing"] };

  it("unions exemplars and counts only new additions", () => {
    const { rulebook, added } = mergeBrandVoice(base, {
      bannedWords: ["loud"],
      exemplars: ["existing", "new one"]
    });
    expect(added).toBe(1);
    expect(rulebook.exemplars).toEqual(["existing", "existing", "new one"]);
    expect(rulebook.bannedWords).toEqual(["spam", "loud"]);
    expect(rulebook.tone).toBe("calm");
  });

  it("replaces tone only when provided", () => {
    expect(
      mergeBrandVoice(base, { tone: "fierce", bannedWords: [], exemplars: [] }).rulebook.tone
    ).toBe("fierce");
    expect(mergeBrandVoice(base, { bannedWords: [], exemplars: [] }).rulebook.tone).toBe("calm");
  });

  it("seeds from a recipe preset", () => {
    const recipe = STARTER_RECIPES.creator;
    const { rulebook } = mergeBrandVoice(
      { tone: "", bannedWords: [], exemplars: [] },
      { tone: recipe.tone, bannedWords: recipe.bannedWords, exemplars: recipe.exemplars }
    );
    expect(rulebook.tone).toBe(recipe.tone);
    expect(rulebook.exemplars).toEqual(recipe.exemplars);
  });
});
