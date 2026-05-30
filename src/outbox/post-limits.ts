/**
 * Per-platform **post** (feed) limits for the composer (#87).
 *
 * Distinct from the inbox reply limits in `src/inbox/platform-limits.ts`: a
 * feed post has different character caps and media rules than a DM/comment
 * reply (e.g. X allows 280 chars in a tweet, 4 images; LinkedIn allows 3000
 * chars in a share). This is the single server-side source of truth the outbox
 * router enforces; `ui/lib/compose.ts` mirrors it so the browser blocks an
 * over-limit submit before it ever hits the API. Both sides MUST stay in sync.
 */

/** Limits + capabilities for one platform's feed post surface. */
export interface PlatformPostLimits {
  /** Display label. */
  label: string;
  /** Max characters for the post body. */
  charLimit: number;
  /** Max media attachments per post (0 ⇒ text-only). */
  maxMedia: number;
  /** Accepted media MIME types (empty ⇒ media not supported). */
  mediaTypes: string[];
  /** Max bytes per media attachment. */
  maxMediaBytes: number;
  /** Whether alt text can be attached to images. */
  altTextSupported: boolean;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const FIVE_MB = 5 * 1024 * 1024;
const TWENTY_MB = 20 * 1024 * 1024;

/**
 * Feed post limits per platform. Values reflect documented public API
 * constraints as of v1; conservative where a platform publishes ranges.
 */
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
  /** MIME type, used for media-type validation. */
  type: string;
  /** Optional alt text for accessibility (images only). */
  altText?: string;
  /** Optional size in bytes, used for media-size validation. */
  bytes?: number;
}

/** Validation outcome for a candidate post. */
export interface PostValidation {
  ok: boolean;
  /** Reason when `ok` is false. */
  reason?: string;
}

/**
 * Validate a post body + media against a platform's limits. Pure + shared by
 * the server router and (mirrored) the browser composer so the rules are
 * enforced identically on both sides.
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
