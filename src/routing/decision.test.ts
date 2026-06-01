import { describe, expect, it } from "vitest";

import { decideRouting } from "./decision.js";
import type { RoutingThresholds } from "./types.js";

const THRESHOLDS: RoutingThresholds = { confidenceThreshold: 0.85, voiceThreshold: 0.8 };

describe("decideRouting", () => {
  it("auto-sends the epic worked example (0.92 / 0.85)", () => {
    const d = decideRouting({ confidence: 0.92, voiceMatch: 0.85 }, THRESHOLDS);
    expect(d.action).toBe("auto_send");
    expect(d.autoSend).toBe(true);
    expect(d.reasons).toHaveLength(1);
  });

  it("treats the thresholds as inclusive (exactly 0.85 / 0.80 → auto_send)", () => {
    const d = decideRouting({ confidence: 0.85, voiceMatch: 0.8 }, THRESHOLDS);
    expect(d.action).toBe("auto_send");
  });

  it("queues a draft a hair below the confidence threshold", () => {
    const d = decideRouting({ confidence: 0.8499, voiceMatch: 0.95 }, THRESHOLDS);
    expect(d.action).toBe("queue");
    expect(d.reasons).toContain("confidence 0.8499 < 0.85");
  });

  it("queues a draft a hair below the voice threshold", () => {
    const d = decideRouting({ confidence: 0.99, voiceMatch: 0.7999 }, THRESHOLDS);
    expect(d.action).toBe("queue");
    expect(d.reasons).toContain("voice 0.7999 < 0.8");
  });

  it("queues the epic low-confidence example (0.6)", () => {
    const d = decideRouting({ confidence: 0.6, voiceMatch: 0.95 }, THRESHOLDS);
    expect(d.action).toBe("queue");
    expect(d.autoSend).toBe(false);
  });

  it("reports both failing gates when both miss", () => {
    const d = decideRouting({ confidence: 0.1, voiceMatch: 0.1 }, THRESHOLDS);
    expect(d.reasons).toHaveLength(2);
  });
});
