/**
 * Hybrid-posture routing decision (epic #78, #81).
 *
 * The single rule that distinguishes an auto-send from a queued draft:
 *
 *   auto_send  ⇔  confidence ≥ confidenceThreshold  AND  voiceMatch ≥ voiceThreshold
 *
 * Both comparisons are **inclusive** — a draft scoring exactly at a threshold
 * passes that gate. Everything else is queued for human approval. The function
 * is pure and synchronous so the boundary behaviour is testable to the decimal.
 */
import type { RoutingDecision, RoutingThresholds } from "./types.js";

/** The scores a draft carries into the routing gate. */
export interface RoutingScores {
  /** Model confidence in [0,1]. */
  confidence: number;
  /** Brand-voice match in [0,1] (post banned-word veto). */
  voiceMatch: number;
}

/**
 * Decide whether a scored draft is auto-sent or queued under the Hybrid posture.
 *
 * @param scores     The draft's confidence and voice-match scores.
 * @param thresholds The (per-platform-configurable) auto-send gates.
 * @returns A {@link RoutingDecision} with the action and explanatory reasons.
 */
export function decideRouting(
  scores: RoutingScores,
  thresholds: RoutingThresholds
): RoutingDecision {
  const { confidence, voiceMatch } = scores;
  const { confidenceThreshold, voiceThreshold } = thresholds;

  const confidenceOk = confidence >= confidenceThreshold;
  const voiceOk = voiceMatch >= voiceThreshold;
  const autoSend = confidenceOk && voiceOk;

  const reasons: string[] = [];
  if (autoSend) {
    reasons.push(
      `confidence ${confidence} ≥ ${confidenceThreshold} and voice ${voiceMatch} ≥ ${voiceThreshold}`
    );
  } else {
    if (!confidenceOk) {
      reasons.push(`confidence ${confidence} < ${confidenceThreshold}`);
    }
    if (!voiceOk) {
      reasons.push(`voice ${voiceMatch} < ${voiceThreshold}`);
    }
  }

  return {
    action: autoSend ? "auto_send" : "queue",
    autoSend,
    confidence,
    voiceMatch,
    reasons
  };
}
