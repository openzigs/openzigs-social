import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIER_WRITE_QUOTA,
  TIER_DM_PERMITTED,
  isDmEnabledForTier,
  tierWriteQuota,
  type TwitterTier
} from "./tiers.js";

describe("tier write quota", () => {
  it("returns the documented default cap per tier", () => {
    expect(tierWriteQuota("free")).toBe(1_500);
    expect(tierWriteQuota("basic")).toBe(50_000);
    expect(tierWriteQuota("pro")).toBe(1_000_000);
  });

  it("honours a config override for the active tier", () => {
    expect(tierWriteQuota("free", { free: 100 })).toBe(100);
  });

  it("falls back to the default when the override omits the tier", () => {
    expect(tierWriteQuota("basic", { free: 100 })).toBe(DEFAULT_TIER_WRITE_QUOTA.basic);
  });
});

describe("isDmEnabledForTier", () => {
  it("force-disables DM on Free regardless of the opt-in flag", () => {
    expect(isDmEnabledForTier("free", true)).toBe(false);
    expect(isDmEnabledForTier("free", false)).toBe(false);
  });

  it("enables DM on a paid tier only when opted in", () => {
    expect(isDmEnabledForTier("basic", true)).toBe(true);
    expect(isDmEnabledForTier("basic", false)).toBe(false);
    expect(isDmEnabledForTier("pro", true)).toBe(true);
  });

  it("mirrors the DM-permission policy table", () => {
    const tiers: TwitterTier[] = ["free", "basic", "pro"];
    for (const tier of tiers) {
      expect(isDmEnabledForTier(tier, true)).toBe(TIER_DM_PERMITTED[tier]);
    }
  });
});
