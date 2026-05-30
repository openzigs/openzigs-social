/**
 * Client-side mirror of the server feed-post limits (`src/outbox/post-limits.ts`).
 *
 * The composer reads this to enforce character/media rules **before** a post
 * ever leaves the browser — most importantly blocking an over-280-char X post
 * from being submitted (#87). The server re-validates with the same rules via
 * `validatePost`, so this is a UX nicety, never the security boundary. Both
 * sides MUST stay in sync; if you change a limit here, change it there too.
 */

/** Limits + capabilities for one platform's feed post surface. */
export interface PlatformPostLimits {
  label: string;
  charLimit: number;
  maxMedia: number;
  mediaTypes: string[];
  maxMediaBytes: number;
  altTextSupported: boolean;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const FIVE_MB = 5 * 1024 * 1024;
const TWENTY_MB = 20 * 1024 * 1024;

/** Mirror of the server `POST_LIMITS` table. */
export const POST_LIMITS: Record<string, PlatformPostLimits> = {
  instagram: {
    label: "Instagram",
    charLimit: 2200,
    maxMedia: 10,
    mediaTypes: [...IMAGE_TYPES, ...VIDEO_TYPES],
    maxMediaBytes: TWENTY_MB,
    altTextSupported: true
  },
  facebook: {
    label: "Facebook",
    charLimit: 63206,
    maxMedia: 10,
    mediaTypes: [...IMAGE_TYPES, ...VIDEO_TYPES],
    maxMediaBytes: TWENTY_MB,
    altTextSupported: true
  },
  threads: {
    label: "Threads",
    charLimit: 500,
    maxMedia: 10,
    mediaTypes: [...IMAGE_TYPES, ...VIDEO_TYPES],
    maxMediaBytes: TWENTY_MB,
    altTextSupported: true
  },
  linkedin: {
    label: "LinkedIn",
    charLimit: 3000,
    maxMedia: 9,
    mediaTypes: IMAGE_TYPES,
    maxMediaBytes: TWENTY_MB,
    altTextSupported: true
  },
  pinterest: {
    label: "Pinterest",
    charLimit: 500,
    maxMedia: 1,
    mediaTypes: IMAGE_TYPES,
    maxMediaBytes: TWENTY_MB,
    altTextSupported: true
  },
  tiktok: {
    label: "TikTok",
    charLimit: 2200,
    maxMedia: 1,
    mediaTypes: VIDEO_TYPES,
    maxMediaBytes: TWENTY_MB,
    altTextSupported: false
  },
  twitter: {
    label: "X (Twitter)",
    charLimit: 280,
    maxMedia: 4,
    mediaTypes: [...IMAGE_TYPES, ...VIDEO_TYPES],
    maxMediaBytes: FIVE_MB,
    altTextSupported: true
  }
};

/** Fallback limits for an unknown platform — conservative, text-only. */
export const DEFAULT_POST_LIMITS: PlatformPostLimits = {
  label: "Unknown",
  charLimit: 280,
  maxMedia: 0,
  mediaTypes: [],
  maxMediaBytes: 0,
  altTextSupported: false
};

/** Resolve the post limits for a platform key (case-insensitive). */
export function postLimitsFor(platform: string): PlatformPostLimits {
  return POST_LIMITS[platform.toLowerCase()] ?? DEFAULT_POST_LIMITS;
}

/** A single media attachment on a draft post. */
export interface PostMedia {
  url: string;
  type: string;
  altText?: string;
  bytes?: number;
}

/** Validation outcome for a candidate post. */
export interface PostValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a post body + media against a platform's limits. Mirror of the
 * server `validatePost`, kept pure so the composer can block submit and show
 * the same reason string the server would return.
 */
export function validatePost(
  platform: string,
  body: string,
  media: PostMedia[] = []
): PostValidation {
  const limits = postLimitsFor(platform);
  const hasBody = body.trim().length > 0;
  if (!hasBody && media.length === 0) {
    return { ok: false, reason: "post is empty" };
  }
  if (body.length > limits.charLimit) {
    return {
      ok: false,
      reason: `post exceeds ${limits.charLimit} character limit for ${limits.label}`
    };
  }
  if (media.length > limits.maxMedia) {
    return {
      ok: false,
      reason: `${limits.label} allows at most ${limits.maxMedia} attachment(s)`
    };
  }
  for (const item of media) {
    if (!limits.mediaTypes.includes(item.type)) {
      return {
        ok: false,
        reason: `${limits.label} does not accept media of type ${item.type}`
      };
    }
    if (item.bytes !== undefined && item.bytes > limits.maxMediaBytes) {
      return {
        ok: false,
        reason: `media exceeds ${limits.maxMediaBytes} byte limit for ${limits.label}`
      };
    }
  }
  return { ok: true };
}

/** Remaining characters for a body against a platform's cap (may be negative). */
export function charactersRemaining(platform: string, body: string): number {
  return postLimitsFor(platform).charLimit - body.length;
}
