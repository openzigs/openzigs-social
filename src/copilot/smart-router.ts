/**
 * Smart router.
 *
 * v1 token estimator: `Math.ceil(charCount / 4)`. Routes to the local
 * provider when the estimate is at or below `cloudThresholdTokens`, or when
 * the privacy controller forces local. Otherwise prefers the configured
 * cloud provider.
 */
import { type PrivacyController, forcesLocal, type PrivacyMode } from "./privacy.js";
import type { ChatMessage, Provider } from "./providers/index.js";

export const DEFAULT_CLOUD_THRESHOLD_TOKENS = 4096;

export type RouteDecision = "local" | "cloud";

export interface RouterConfig {
  cloudThresholdTokens?: number;
  /** Static privacy mode (used when no controller is provided). */
  privacyMode?: PrivacyMode;
}

export interface RouterDeps {
  local: Provider;
  cloud?: Provider;
  privacy?: PrivacyController;
}

export function estimateTokens(messages: ChatMessage[]): number {
  const chars = messages.reduce((acc, m) => acc + m.content.length, 0);
  return Math.ceil(chars / 4);
}

export interface RouteResult {
  provider: Provider;
  decision: RouteDecision;
  estimatedTokens: number;
  reason: "privacy" | "threshold" | "no-cloud" | "default-cloud";
}

export class SmartRouter {
  private readonly threshold: number;
  private readonly fallbackMode: PrivacyMode;
  constructor(
    private readonly deps: RouterDeps,
    config: RouterConfig = {}
  ) {
    this.threshold = config.cloudThresholdTokens ?? DEFAULT_CLOUD_THRESHOLD_TOKENS;
    this.fallbackMode = config.privacyMode ?? "off";
  }

  get cloudThresholdTokens(): number {
    return this.threshold;
  }

  route(messages: ChatMessage[]): RouteResult {
    const estimatedTokens = estimateTokens(messages);
    const mode = this.deps.privacy?.mode ?? this.fallbackMode;

    if (forcesLocal(mode)) {
      return {
        provider: this.deps.local,
        decision: "local",
        estimatedTokens,
        reason: "privacy"
      };
    }
    if (!this.deps.cloud) {
      return {
        provider: this.deps.local,
        decision: "local",
        estimatedTokens,
        reason: "no-cloud"
      };
    }
    if (estimatedTokens <= this.threshold) {
      return {
        provider: this.deps.local,
        decision: "local",
        estimatedTokens,
        reason: "threshold"
      };
    }
    return {
      provider: this.deps.cloud,
      decision: "cloud",
      estimatedTokens,
      reason: "default-cloud"
    };
  }
}
