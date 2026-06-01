/**
 * Brand-voice domain types (epic #78, #79).
 *
 * v1 keeps exactly one brand voice per workspace — the openzigs multi-personality
 * system is intentionally dropped. A {@link BrandVoiceRulebook} is the rule set
 * the Linguistic Profiler scores drafts against; a {@link VoiceScore} is the
 * profiler's verdict for a single draft.
 */

/** The single workspace brand-voice rulebook the profiler reads. */
export interface BrandVoiceRulebook {
  /** Free-text tone descriptor, e.g. "warm, concise, lightly playful". */
  tone: string;
  /** Lowercase words/phrases that must never appear. Any hit vetoes a draft. */
  bannedWords: string[];
  /** Exemplar posts that define the house voice. */
  exemplars: string[];
}

/** The Linguistic Profiler's verdict for one draft. */
export interface VoiceScore {
  /**
   * Composite brand-voice match in [0,1]. Equal to {@link toneMatch} unless a
   * banned word is present, in which case it is vetoed to 0.
   */
  score: number;
  /** Lexical tone-coverage component in [0,1] (before the banned-word veto). */
  toneMatch: number;
  /** Count of banned-word hits found in the draft. */
  bannedWordPenalty: number;
  /** The specific banned words/phrases the draft tripped (empty when clean). */
  bannedHits: string[];
}

/** An empty rulebook (no tone, no banned words, no exemplars). */
export const EMPTY_RULEBOOK: BrandVoiceRulebook = {
  tone: "",
  bannedWords: [],
  exemplars: []
};
