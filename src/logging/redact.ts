/**
 * Central secret-redaction helper.
 *
 * Used by both the Winston logger metadata path and the AuditLogger so that
 * `apiKey`, `accessToken`, `refreshToken`, `password`, and similar values are
 * NEVER written to logs or audit JSONL.
 */

/** Key names whose values are always redacted (case-insensitive substring). */
const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /api[-_]?key/i,
  /access[-_]?token/i,
  /refresh[-_]?token/i,
  /\btoken\b/i,
  /password/i,
  /passphrase/i,
  /secret/i,
  /client[-_]?secret/i,
  /authorization/i,
  /private[-_]?key/i
];

export const REDACTED = "[REDACTED]";

/**
 * Value-level secret shapes scrubbed from *string values* (including free-form
 * log `message` fields), independent of their key name. Kept deliberately
 * conservative — only well-known, high-signal token formats — to avoid
 * over-scrubbing legitimate log content.
 */
const VALUE_SCRUBBERS: { re: RegExp; replacement: string }[] = [
  // `Bearer <token>` authorization headers.
  { re: /Bearer\s+[A-Za-z0-9._\-]+/gi, replacement: "Bearer [REDACTED]" },
  // OpenAI-style API keys (`sk-...`).
  { re: /sk-[A-Za-z0-9]{16,}/g, replacement: "sk-[REDACTED]" }
];

/** True when a key name indicates its value is sensitive. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

/**
 * Mask known secret shapes embedded inside a free-form string. Returns the
 * input unchanged when no pattern matches.
 */
export function scrubSecretsInString(value: string): string {
  let out = value;
  for (const { re, replacement } of VALUE_SCRUBBERS) {
    out = out.replace(re, replacement);
  }
  return out;
}

/**
 * Recursively redact sensitive values. Objects and arrays are cloned; the
 * input is never mutated. Cyclic references are handled.
 *
 * Two layers run: (1) key-name redaction masks values under sensitive keys,
 * and (2) {@link scrubSecretsInString} masks known secret shapes embedded in
 * any remaining string value (e.g. a `Bearer` token inside a `message`).
 */
export function redact<T>(value: T): T {
  return redactInner(value, undefined, new WeakSet<object>()) as T;
}

function redactInner(value: unknown, key: string | undefined, seen: WeakSet<object>): unknown {
  if (key !== undefined && isSensitiveKey(key) && value !== null && value !== undefined) {
    return REDACTED;
  }

  if (typeof value === "string") {
    return scrubSecretsInString(value);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return value.map((item) => redactInner(item, undefined, seen));
  }

  if (value !== null && typeof value === "object") {
    if (seen.has(value as object)) return "[Circular]";
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = redactInner(childValue, childKey, seen);
    }
    return out;
  }

  return value;
}
