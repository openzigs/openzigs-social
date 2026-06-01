/**
 * Auto-reply routing types (epic #78, #80, #81).
 */

/** The per-platform-configurable score gates for the Hybrid posture. */
export interface RoutingThresholds {
  /** Minimum model confidence in [0,1] for an auto-send. */
  confidenceThreshold: number;
  /** Minimum brand-voice match in [0,1] for an auto-send. */
  voiceThreshold: number;
}

/** What the Hybrid posture decided to do with a draft. */
export type RoutingAction = "auto_send" | "queue";

/** The routing verdict for a single draft, with human-readable reasons. */
export interface RoutingDecision {
  /** `auto_send` when both scores cleared their (inclusive) thresholds. */
  action: RoutingAction;
  /** Convenience flag: `action === "auto_send"`. */
  autoSend: boolean;
  /** The confidence score that was evaluated. */
  confidence: number;
  /** The voice-match score that was evaluated. */
  voiceMatch: number;
  /** Why the decision was reached (one entry per gate that failed, or a pass). */
  reasons: string[];
}
