/**
 * Deterministic lead scorer (epic #90 / #92).
 *
 * Mirrors the architecture of the Linguistic Profiler's `scoreVoice`
 * ({@link ../personality/profiler.ts}): a pure, network-free, randomness-free
 * function so identical input always yields identical output and the whole
 * thing is trivially unit-testable. No ML, no LLM call, no clock dependency.
 *
 * The composite score (0..1) blends three signals:
 *   1. Engagement frequency — inbound + outbound messages in the last N days,
 *      saturating at `engagementTarget`.
 *   2. Sentiment — a tiny positive/negative lexicon over recent message bodies,
 *      neutral (0.5) when no sentiment-bearing words are present.
 *   3. Audience — `follower_count`, log-scaled and tolerant of a missing/0 value.
 *
 * Binding acceptance criterion (#92): a contact with `engagementTarget`+
 * engagements in the window lands in the top bucket. With the default weights
 * (engagement 0.7) and `topThreshold` 0.75, exactly `engagementTarget`
 * engagements — neutral sentiment, zero followers — scores precisely 0.75 and
 * tips into `top` on the inclusive boundary.
 */

/** Tunable weights + thresholds (sourced from `config.crm.leadScore`). */
export interface LeadScoreWeights {
  /** Sliding window (days) for the engagement count. */
  engagementWindowDays: number;
  /** Engagement count that saturates the engagement signal to 1.0. */
  engagementTarget: number;
  /** Follower count that saturates the (log-scaled) audience signal to 1.0. */
  followerTarget: number;
  /** Weight applied to the engagement signal. */
  weightEngagement: number;
  /** Weight applied to the sentiment signal. */
  weightSentiment: number;
  /** Weight applied to the audience signal. */
  weightFollower: number;
  /** Inclusive score boundary for the `top` bucket. */
  topThreshold: number;
  /** Inclusive score boundary for the `high` bucket. */
  highThreshold: number;
  /** Inclusive score boundary for the `medium` bucket. */
  mediumThreshold: number;
}

/** The default weights, mirrored by `config.crm.leadScore` in the schema. */
export const DEFAULT_LEAD_SCORE_WEIGHTS: LeadScoreWeights = {
  engagementWindowDays: 7,
  engagementTarget: 30,
  followerTarget: 100_000,
  weightEngagement: 0.7,
  weightSentiment: 0.1,
  weightFollower: 0.2,
  topThreshold: 0.75,
  highThreshold: 0.5,
  mediumThreshold: 0.25
};

/** Inputs to the scorer; all already derived from the DB at the boundary. */
export interface LeadScoreInput {
  /** Messages (any direction) within the engagement window. */
  engagementCount: number;
  /** Cached audience size; `null`/`undefined`/negative is treated as 0. */
  followerCount?: number | null;
  /** Recent message bodies used for the sentiment heuristic. */
  recentMessages?: readonly string[];
}

/** Coarse lead-priority bucket. `top` ≈ the "top 10%" tier in the UI. */
export type LeadBucket = "top" | "high" | "medium" | "low";

/** The scorer result: composite score, bucket, and the raw signal breakdown. */
export interface LeadScore {
  score: number;
  bucket: LeadBucket;
  components: {
    engagement: number;
    sentiment: number;
    follower: number;
  };
}

/**
 * Tiny sentiment lexicons. Intentionally small and deterministic — this is a
 * heuristic prioritisation signal, not a sentiment-analysis product. Tokens are
 * matched case-insensitively against word-split message bodies.
 */
const POSITIVE_WORDS = new Set([
  "thanks",
  "thank",
  "love",
  "loved",
  "great",
  "awesome",
  "amazing",
  "excited",
  "happy",
  "perfect",
  "excellent",
  "wonderful",
  "appreciate",
  "appreciated",
  "good",
  "best",
  "interested",
  "yes",
  "please",
  "helpful"
]);

const NEGATIVE_WORDS = new Set([
  "hate",
  "hated",
  "terrible",
  "awful",
  "bad",
  "worst",
  "angry",
  "annoyed",
  "annoying",
  "disappointed",
  "disappointing",
  "refund",
  "cancel",
  "cancelled",
  "broken",
  "useless",
  "scam",
  "never",
  "unsubscribe",
  "complaint"
]);

/** Clamp a number into the inclusive [0, 1] range. */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Lowercase + split a body into alphanumeric tokens. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((t) => t.length > 0);
}

/**
 * Lexicon sentiment in [0, 1]. Neutral (0.5) when a text carries no
 * sentiment-bearing words. Positive and negative hits are netted, then mapped
 * onto [0, 1] with 0.5 as the neutral midpoint.
 */
export function scoreSentiment(messages: readonly string[]): number {
  let positive = 0;
  let negative = 0;
  for (const message of messages) {
    for (const token of tokenize(message)) {
      if (POSITIVE_WORDS.has(token)) positive += 1;
      else if (NEGATIVE_WORDS.has(token)) negative += 1;
    }
  }
  const total = positive + negative;
  if (total === 0) return 0.5;
  // Net polarity in [-1, 1] → [0, 1] with neutral at 0.5.
  return clamp01(0.5 + 0.5 * ((positive - negative) / total));
}

/**
 * Score a single contact's lead priority. Pure: same input ⇒ same output.
 */
export function scoreLead(
  input: LeadScoreInput,
  weights: LeadScoreWeights = DEFAULT_LEAD_SCORE_WEIGHTS
): LeadScore {
  const engagementTarget = weights.engagementTarget > 0 ? weights.engagementTarget : 1;
  const engagement = clamp01((input.engagementCount ?? 0) / engagementTarget);

  const sentiment = scoreSentiment(input.recentMessages ?? []);

  const followers =
    typeof input.followerCount === "number" && Number.isFinite(input.followerCount)
      ? Math.max(0, input.followerCount)
      : 0;
  const followerTarget = weights.followerTarget > 0 ? weights.followerTarget : 1;
  // Log-scaled so a handful of followers still registers while huge audiences
  // do not dwarf every other signal. log1p(target) is the saturation point.
  const follower = clamp01(Math.log1p(followers) / Math.log1p(followerTarget));

  const score = clamp01(
    weights.weightEngagement * engagement +
      weights.weightSentiment * sentiment +
      weights.weightFollower * follower
  );

  return {
    score,
    bucket: bucketFor(score, weights),
    components: { engagement, sentiment, follower }
  };
}

/** Map a composite score to a bucket using the configured inclusive boundaries. */
export function bucketFor(score: number, weights: LeadScoreWeights): LeadBucket {
  if (score >= weights.topThreshold) return "top";
  if (score >= weights.highThreshold) return "high";
  if (score >= weights.mediumThreshold) return "medium";
  return "low";
}
