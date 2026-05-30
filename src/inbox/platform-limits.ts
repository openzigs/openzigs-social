/**
 * Per-platform inbox capabilities + reply constraints (#76).
 *
 * A single shared table the reply composer (UI) and the reply endpoint (server)
 * both read, so character limits and media constraints are defined once. This
 * is the source of truth for the LinkedIn "comments-only" limitation: LinkedIn
 * personal accounts cannot read or send DMs via the API (that requires the
 * Compliance Partner Program), so `dmSupported` is false and the UI hides the
 * DM section.
 */

/** Limits + capabilities for one platform's inbox surface. */
export interface PlatformInboxLimits {
  /** Display label. */
  label: string;
  /** Whether DMs are supported at all (false ⇒ comments-only). */
  dmSupported: boolean;
  /** Max characters for a DM reply (only meaningful when `dmSupported`). */
  dmCharLimit: number;
  /** Max characters for a comment reply. */
  commentCharLimit: number;
  /** Max media attachments per reply (0 ⇒ none). */
  maxMedia: number;
}

/**
 * Platform inbox limits. Values reflect documented public API constraints as of
 * v1; conservative where a platform publishes ranges.
 */
export const PLATFORM_LIMITS: Record<string, PlatformInboxLimits> = {
  instagram: {
    label: "Instagram",
    dmSupported: true,
    dmCharLimit: 1000,
    commentCharLimit: 2200,
    maxMedia: 1
  },
  facebook: {
    label: "Facebook",
    dmSupported: true,
    dmCharLimit: 2000,
    commentCharLimit: 8000,
    maxMedia: 1
  },
  threads: {
    label: "Threads",
    dmSupported: false,
    dmCharLimit: 0,
    commentCharLimit: 500,
    maxMedia: 1
  },
  youtube: {
    label: "YouTube",
    dmSupported: false,
    dmCharLimit: 0,
    commentCharLimit: 10000,
    maxMedia: 0
  },
  // LinkedIn personal accounts are comments-only in v1 (DMs need the
  // Compliance Partner Program). dmSupported drives the UI hiding the DM section.
  linkedin: {
    label: "LinkedIn",
    dmSupported: false,
    dmCharLimit: 0,
    commentCharLimit: 1250,
    maxMedia: 0
  },
  twitter: {
    label: "X (Twitter)",
    dmSupported: true,
    dmCharLimit: 10000,
    commentCharLimit: 280,
    maxMedia: 4
  }
};

/** Fallback limits for an unknown platform — conservative, DM-disabled. */
export const DEFAULT_LIMITS: PlatformInboxLimits = {
  label: "Unknown",
  dmSupported: false,
  dmCharLimit: 0,
  commentCharLimit: 1000,
  maxMedia: 0
};

/** Resolve the limits for a platform key (case-insensitive), never throwing. */
export function limitsFor(platform: string): PlatformInboxLimits {
  return PLATFORM_LIMITS[platform.toLowerCase()] ?? DEFAULT_LIMITS;
}

/** Whether the platform supports DMs in the inbox. */
export function isDmSupported(platform: string): boolean {
  return limitsFor(platform).dmSupported;
}

/** A reply kind targets either the DM surface or the comment surface. */
export type ReplyKind = "dm" | "comment";

/** Validation outcome for a candidate reply. */
export interface ReplyValidation {
  ok: boolean;
  /** Reason when `ok` is false. */
  reason?: string;
}

/** Validate a reply body + media against a platform's limits. */
export function validateReply(
  platform: string,
  kind: ReplyKind,
  body: string,
  mediaCount = 0
): ReplyValidation {
  const limits = limitsFor(platform);
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "reply body is empty" };
  }
  if (kind === "dm" && !limits.dmSupported) {
    return { ok: false, reason: `${limits.label} does not support DMs` };
  }
  const charLimit = kind === "dm" ? limits.dmCharLimit : limits.commentCharLimit;
  if (body.length > charLimit) {
    return { ok: false, reason: `reply exceeds ${charLimit} character limit for ${limits.label}` };
  }
  if (mediaCount > limits.maxMedia) {
    return { ok: false, reason: `${limits.label} allows at most ${limits.maxMedia} attachment(s)` };
  }
  return { ok: true };
}
