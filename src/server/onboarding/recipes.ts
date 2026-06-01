/**
 * Starter recipes + brand-voice import (epic #100, sub #107 + epic AC).
 *
 * Recipes seed a sensible brand-voice rulebook and posting defaults for three
 * common personas (creator / small-biz / agency) so a new operator is not
 * staring at an empty wizard. Brand-voice import parses a pasted/uploaded JSON
 * or CSV document into exemplars that feed the deterministic vocabulary the
 * profiler scores against (the "exemplar embeddings" in the epic).
 */
import type { BrandVoiceRulebook } from "../../personality/types.js";

export const RECIPE_IDS = ["creator", "small-biz", "agency"] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];

export interface StarterRecipe {
  id: RecipeId;
  label: string;
  description: string;
  tone: string;
  bannedWords: string[];
  exemplars: string[];
  /** Suggested platforms to connect first, in priority order. */
  suggestedPlatforms: string[];
  /** Suggested posting cadence (posts per week). */
  cadencePerWeek: number;
}

export const STARTER_RECIPES: Record<RecipeId, StarterRecipe> = {
  creator: {
    id: "creator",
    label: "Creator",
    description: "Personal brand, high-frequency, conversational and authentic.",
    tone: "Warm, conversational, and energetic — first person, emoji-friendly.",
    bannedWords: ["synergy", "leverage", "circle back"],
    exemplars: [
      "Just dropped a new video — here's the behind-the-scenes you didn't see 👀",
      "Real talk: this took me three tries to get right. Worth it."
    ],
    suggestedPlatforms: ["instagram", "tiktok", "twitter"],
    cadencePerWeek: 7
  },
  "small-biz": {
    id: "small-biz",
    label: "Small business",
    description: "Local/SMB voice, helpful and trustworthy with clear calls to action.",
    tone: "Friendly, professional, and helpful — plain language, clear CTAs.",
    bannedWords: ["cheap", "guaranteed", "act now"],
    exemplars: [
      "New hours starting Monday! We're open till 8pm on weekdays.",
      "Thanks to everyone who stopped by this weekend — you made our day."
    ],
    suggestedPlatforms: ["facebook", "instagram", "linkedin"],
    cadencePerWeek: 4
  },
  agency: {
    id: "agency",
    label: "Agency",
    description: "Multi-client, on-brand and measured, optimized for scheduling at scale.",
    tone: "Polished, on-brand, and consistent — adaptable across client voices.",
    bannedWords: ["cheap", "spammy", "clickbait"],
    exemplars: [
      "Case study: how we grew organic reach 3x in 90 days for a B2B client.",
      "Our team is hiring a senior social strategist — link in bio."
    ],
    suggestedPlatforms: ["linkedin", "facebook", "instagram", "twitter"],
    cadencePerWeek: 10
  }
};

/** List recipes in canonical order (safe to serialize directly). */
export function listRecipes(): StarterRecipe[] {
  return RECIPE_IDS.map((id) => STARTER_RECIPES[id]);
}

export function isRecipeId(value: string): value is RecipeId {
  return (RECIPE_IDS as readonly string[]).includes(value);
}

export type ImportFormat = "json" | "csv";

export interface ParsedBrandVoice {
  tone?: string;
  bannedWords: string[];
  exemplars: string[];
}

/** Result of merging an import/recipe into the existing rulebook. */
export interface MergeResult {
  rulebook: BrandVoiceRulebook;
  added: number;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * Parse a brand-voice import document.
 *
 * JSON accepts either an array of exemplar strings, or an object with optional
 * `tone`, `bannedWords`, and `exemplars` fields. CSV is treated as one exemplar
 * per line, with surrounding quotes stripped (a single leading header row named
 * `exemplar`/`exemplars` is ignored).
 *
 * Throws on malformed input so the route can return a 422.
 */
export function parseBrandVoiceImport(content: string, format: ImportFormat): ParsedBrandVoice {
  const trimmed = content.trim();
  if (trimmed.length === 0) throw new Error("empty import");

  if (format === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("invalid JSON");
    }
    if (Array.isArray(parsed)) {
      return { bannedWords: [], exemplars: asStringArray(parsed) };
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      return {
        ...(typeof obj.tone === "string" && obj.tone.trim().length > 0
          ? { tone: obj.tone.trim() }
          : {}),
        bannedWords: asStringArray(obj.bannedWords),
        exemplars: asStringArray(obj.exemplars)
      };
    }
    throw new Error("unsupported JSON shape");
  }

  // CSV: one exemplar per line.
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^"(.*)"$/, "$1").trim());
  const header = lines[0];
  if (header !== undefined && /^exemplars?$/i.test(header)) {
    lines.shift();
  }
  return { bannedWords: [], exemplars: lines };
}

/**
 * Merge parsed brand-voice fields into an existing rulebook. Tone is replaced
 * only when provided; banned words and exemplars are unioned. Returns the
 * merged rulebook and how many exemplars were newly added.
 */
export function mergeBrandVoice(
  current: BrandVoiceRulebook,
  incoming: ParsedBrandVoice
): MergeResult {
  const before = new Set(current.exemplars.map((e) => e.trim().toLowerCase()));
  const mergedExemplars = [...current.exemplars, ...incoming.exemplars];
  const mergedBanned = [...current.bannedWords, ...incoming.bannedWords];
  let added = 0;
  for (const exemplar of incoming.exemplars) {
    const key = exemplar.trim().toLowerCase();
    if (key.length > 0 && !before.has(key)) {
      before.add(key);
      added += 1;
    }
  }
  return {
    rulebook: {
      tone: incoming.tone ?? current.tone,
      bannedWords: mergedBanned,
      exemplars: mergedExemplars
    },
    added
  };
}
