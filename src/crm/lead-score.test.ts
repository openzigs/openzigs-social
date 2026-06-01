import { describe, expect, it } from "vitest";

import {
  DEFAULT_LEAD_SCORE_WEIGHTS,
  bucketFor,
  scoreLead,
  scoreSentiment,
  type LeadScoreWeights
} from "./lead-score.js";

const W = DEFAULT_LEAD_SCORE_WEIGHTS;

describe("scoreSentiment", () => {
  it("is neutral (0.5) with no sentiment-bearing words", () => {
    expect(scoreSentiment([])).toBe(0.5);
    expect(scoreSentiment(["the package arrives tuesday"])).toBe(0.5);
  });

  it("trends positive for positive lexicon hits", () => {
    expect(scoreSentiment(["thanks, this is amazing and I love it"])).toBeGreaterThan(0.5);
  });

  it("trends negative for negative lexicon hits", () => {
    expect(scoreSentiment(["this is terrible, I want a refund"])).toBeLessThan(0.5);
  });

  it("is case-insensitive and nets opposing polarity", () => {
    // One positive + one negative → neutral.
    expect(scoreSentiment(["GREAT but also TERRIBLE"])).toBe(0.5);
  });
});

describe("scoreLead bucketing (epic #92 acceptance)", () => {
  it("places a contact with exactly engagementTarget engagements in the top bucket", () => {
    // 30 engagements, neutral sentiment, zero followers → score exactly 0.75.
    const result = scoreLead({ engagementCount: 30, followerCount: 0, recentMessages: [] }, W);
    expect(result.score).toBeCloseTo(0.75, 10);
    expect(result.bucket).toBe("top");
  });

  it("keeps one engagement below the target out of the top bucket", () => {
    const result = scoreLead({ engagementCount: 29, followerCount: 0, recentMessages: [] }, W);
    expect(result.bucket).toBe("high");
    expect(result.score).toBeLessThan(W.topThreshold);
  });

  it("places contacts well above the target in the top bucket", () => {
    const result = scoreLead({ engagementCount: 100, followerCount: 50_000 }, W);
    expect(result.bucket).toBe("top");
    expect(result.score).toBeGreaterThanOrEqual(W.topThreshold);
  });

  it("buckets a quiet, low-follower contact as low", () => {
    const result = scoreLead({ engagementCount: 0, followerCount: 0, recentMessages: [] }, W);
    expect(result.bucket).toBe("low");
  });
});

describe("scoreLead signal handling", () => {
  it("tolerates a missing/null/negative follower count as zero", () => {
    const components = (followerCount: number | null | undefined): number =>
      scoreLead({ engagementCount: 0, followerCount, recentMessages: [] }, W).components.follower;
    expect(components(undefined)).toBe(0);
    expect(components(null)).toBe(0);
    expect(components(-5)).toBe(0);
  });

  it("log-scales follower count toward the saturation target", () => {
    const small = scoreLead({ engagementCount: 0, followerCount: 10 }, W).components.follower;
    const large = scoreLead({ engagementCount: 0, followerCount: 100_000 }, W).components.follower;
    expect(small).toBeGreaterThan(0);
    expect(large).toBeCloseTo(1, 5);
    expect(large).toBeGreaterThan(small);
  });

  it("saturates the engagement signal at the target", () => {
    const at = scoreLead({ engagementCount: 30 }, W).components.engagement;
    const over = scoreLead({ engagementCount: 300 }, W).components.engagement;
    expect(at).toBe(1);
    expect(over).toBe(1);
  });

  it("clamps a non-finite engagement count to zero", () => {
    const result = scoreLead({ engagementCount: Number.NaN }, W);
    expect(result.components.engagement).toBe(0);
  });

  it("honours custom weights/thresholds", () => {
    const weights: LeadScoreWeights = {
      ...W,
      engagementTarget: 10,
      topThreshold: 0.7
    };
    const result = scoreLead(
      { engagementCount: 10, followerCount: 0, recentMessages: [] },
      weights
    );
    expect(result.components.engagement).toBe(1);
    expect(result.bucket).toBe("top");
  });
});

describe("bucketFor", () => {
  it("maps scores onto the configured inclusive boundaries", () => {
    expect(bucketFor(0.75, W)).toBe("top");
    expect(bucketFor(0.74, W)).toBe("high");
    expect(bucketFor(0.5, W)).toBe("high");
    expect(bucketFor(0.25, W)).toBe("medium");
    expect(bucketFor(0.24, W)).toBe("low");
    expect(bucketFor(0, W)).toBe("low");
  });
});
