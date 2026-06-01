/**
 * Linguistic Profiler (epic #78, #79).
 *
 * Ports the spirit of openzigs' `brand-voice-service.ts` as a dependency-free,
 * fully deterministic scorer. It answers one question: *how well does this draft
 * sound like us?* — and produces a {@link VoiceScore} the Hybrid posture (#81)
 * gates auto-send on.
 *
 * Two signals combine:
 *
 *   1. **Tone match** — weighted lexical coverage of the rulebook's voice
 *      vocabulary (tone descriptor + exemplars) present in the draft. Tone-
 *      descriptor tokens carry double weight because they are the explicit
 *      intent; exemplar tokens carry single weight. The result is `matched /
 *      total` in [0,1].
 *
 *   2. **Banned-word veto** — if any banned word/phrase appears, the composite
 *      score is clamped to 0 regardless of tone match (#80 AC). A banned word
 *      therefore always forces the draft into the approval queue.
 *
 * No network, no embeddings, no randomness: the same (draft, rulebook) pair
 * always yields the same score, which is what makes the routing thresholds
 * testable to the boundary.
 */
import type { BrandVoiceRulebook, VoiceScore } from "./types.js";

/** Lowercase a string and split it into alphanumeric word tokens. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((t) => t.length > 0);
}

/** Clamp `n` into the closed interval [0,1]. */
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Weighted vocabulary entry: a token and how much its presence counts. */
interface WeightedToken {
  token: string;
  weight: number;
}

/**
 * Build the rulebook's voice vocabulary. Tone-descriptor tokens are weighted 2,
 * exemplar tokens 1. Duplicate tokens keep their highest weight so a word that
 * appears in both the tone and an exemplar counts as a tone token.
 */
function buildVocabulary(rulebook: BrandVoiceRulebook): WeightedToken[] {
  const weights = new Map<string, number>();
  for (const token of tokenize(rulebook.tone)) {
    weights.set(token, Math.max(weights.get(token) ?? 0, 2));
  }
  for (const exemplar of rulebook.exemplars) {
    for (const token of tokenize(exemplar)) {
      weights.set(token, Math.max(weights.get(token) ?? 0, 1));
    }
  }
  return [...weights.entries()].map(([token, weight]) => ({ token, weight }));
}

/**
 * Find which banned words/phrases appear in `draft`. Matching is normalised
 * (lowercase, collapsed whitespace) and substring-based so multi-word phrases
 * are caught. Empty/whitespace banned entries are ignored.
 */
function findBannedHits(draft: string, bannedWords: string[]): string[] {
  const haystack = draft.toLowerCase().replace(/\s+/gu, " ");
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const raw of bannedWords) {
    const needle = raw.toLowerCase().trim().replace(/\s+/gu, " ");
    if (needle.length === 0 || seen.has(needle)) continue;
    seen.add(needle);
    if (haystack.includes(needle)) hits.push(raw);
  }
  return hits;
}

/**
 * Score a draft against the brand-voice rulebook.
 *
 * @param draft    The candidate reply text.
 * @param rulebook The workspace brand-voice rulebook.
 * @returns A {@link VoiceScore} with the composite score, its tone-match
 *          component, and any banned-word hits.
 */
export function scoreVoice(draft: string, rulebook: BrandVoiceRulebook): VoiceScore {
  const bannedHits = findBannedHits(draft, rulebook.bannedWords);
  const vocabulary = buildVocabulary(rulebook);
  const draftTokens = new Set(tokenize(draft));

  let matched = 0;
  let total = 0;
  for (const { token, weight } of vocabulary) {
    total += weight;
    if (draftTokens.has(token)) matched += weight;
  }
  const toneMatch = total === 0 ? 0 : clamp01(matched / total);

  // Banned-word veto: any hit clamps the composite to 0 (#80).
  const score = bannedHits.length > 0 ? 0 : toneMatch;

  return {
    score,
    toneMatch,
    bannedWordPenalty: bannedHits.length,
    bannedHits
  };
}
