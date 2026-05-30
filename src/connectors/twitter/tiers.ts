/**
 * X (Twitter) access tiers — Cohort C (#66, sub #69).
 *
 * The X v2 API gates write volume and DM access behind a paid tier. This module
 * is the single source of truth mapping a tier to its monthly write-quota cap
 * and whether DM is *permitted at all* on that tier. The connector reads these
 * to (a) size the credit/quota guard (#70) and (b) hard-disable DM on Free
 * regardless of the `dmEnabled` config flag.
 *
 * The numeric caps are config-overridable (`platform.twitter.writeQuota.*`);
 * the values here are only the fall-back defaults and the DM-permission policy.
 */

/** The three X access tiers we model. */
export type TwitterTier = "free" | "basic" | "pro";

/** Default monthly write-quota caps per tier (posts + replies + DMs). */
export const DEFAULT_TIER_WRITE_QUOTA: Readonly<Record<TwitterTier, number>> = {
  free: 1_500,
  basic: 50_000,
  pro: 1_000_000
};

/**
 * Whether DM is *permitted* on a tier. X does not expose the DM endpoints on
 * the Free tier, so DM is force-disabled there no matter what config says.
 */
export const TIER_DM_PERMITTED: Readonly<Record<TwitterTier, boolean>> = {
  free: false,
  basic: true,
  pro: true
};

/** The effective monthly write cap for a tier, honouring config overrides. */
export function tierWriteQuota(
  tier: TwitterTier,
  overrides?: Partial<Record<TwitterTier, number>>
): number {
  return overrides?.[tier] ?? DEFAULT_TIER_WRITE_QUOTA[tier];
}

/**
 * The effective DM-enabled decision for a tier: DM is on only when the user
 * asked for it (`dmEnabledFlag`) AND the tier permits it. Free always returns
 * false — this is the fail-closed gate the epic requires.
 */
export function isDmEnabledForTier(tier: TwitterTier, dmEnabledFlag: boolean): boolean {
  return dmEnabledFlag && TIER_DM_PERMITTED[tier];
}
