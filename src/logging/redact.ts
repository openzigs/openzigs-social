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

/** True when a key name indicates its value is sensitive. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

/**
 * Recursively redact sensitive values. Objects and arrays are cloned; the
 * input is never mutated. Cyclic references are handled.
 */
export function redact<T>(value: T): T {
  return redactInner(value, undefined, new WeakSet<object>()) as T;
}

function redactInner(value: unknown, key: string | undefined, seen: WeakSet<object>): unknown {
  if (key !== undefined && isSensitiveKey(key) && value !== null && value !== undefined) {
    return REDACTED;
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
