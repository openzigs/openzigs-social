/**
 * Email discovery + normalisation for the merge-suggestion engine (#90 / #94).
 *
 * Pure string helpers — no I/O. The CRM repository feeds these the strings it
 * already holds (a contact's `metadata_json` values and recent message bodies)
 * and uses the result both to seed `crm_contacts.email` and to flag two
 * identities that share a normalised email as a suggested merge.
 */

/**
 * A deliberately conservative email matcher. It is anchored to word-ish
 * boundaries via the split-and-scan in {@link extractEmails} rather than
 * trying to validate RFC 5322 — we only need "good enough to suggest a merge",
 * and false positives are harmless (a human confirms every merge).
 */
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/giu;

/** Normalise an email for equality: trimmed + lowercased. `undefined` if blank. */
export function normalizeEmail(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Extract every distinct normalised email found across the given texts.
 * Order-preserving and de-duplicated. Non-string entries are ignored.
 */
export function extractEmails(texts: ReadonlyArray<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of texts) {
    if (typeof text !== "string") continue;
    // `matchAll` with a global, case-insensitive regex over the raw text.
    for (const match of text.matchAll(EMAIL_RE)) {
      const email = normalizeEmail(match[0]);
      if (email && !seen.has(email)) {
        seen.add(email);
        out.push(email);
      }
    }
  }
  return out;
}

/**
 * Recursively collect every string value out of a parsed metadata object so the
 * email matcher can scan bio text, profile URLs, and arbitrary connector fields
 * without the caller needing to know the shape.
 */
export function collectStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, acc);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, acc);
  }
  return acc;
}

/**
 * Discover the first email associated with a contact, scanning its metadata
 * string values first (bio/profile link) and then its recent message bodies.
 * Returns `undefined` when nothing matches.
 */
export function discoverEmail(
  metadata: unknown,
  messageBodies: ReadonlyArray<string | null | undefined> = []
): string | undefined {
  const fromMetadata = extractEmails(collectStrings(metadata));
  if (fromMetadata.length > 0) return fromMetadata[0];
  const fromMessages = extractEmails(messageBodies);
  return fromMessages[0];
}

/**
 * Best-effort follower-count discovery from a parsed metadata object. Connectors
 * stash audience size under a handful of common keys; we read the first numeric
 * one. Returns 0 when absent so the scorer can treat it uniformly.
 */
export function discoverFollowerCount(metadata: unknown): number {
  if (metadata === null || typeof metadata !== "object") return 0;
  const record = metadata as Record<string, unknown>;
  const keys = ["followerCount", "followers", "follower_count", "followersCount"];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }
  return 0;
}
