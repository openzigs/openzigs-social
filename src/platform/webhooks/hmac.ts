/**
 * Webhook signature verification (#140).
 *
 * Inbound platform webhooks (Instagram/Meta, X, LinkedIn, …) are signed with
 * an HMAC over the raw request body. Verification MUST run against the exact
 * bytes received — JSON re-serialisation would change them — so the router
 * captures the raw `Buffer` before parsing.
 *
 * Comparisons use `crypto.timingSafeEqual` to avoid leaking the secret via
 * timing side-channels, and length mismatches are handled without throwing.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type HmacAlgorithm = "sha1" | "sha256" | "sha512";

/** Compute `HMAC(secret, rawBody)` as a lowercase hex digest. */
export function computeSignature(
  rawBody: Buffer | string,
  secret: string,
  algorithm: HmacAlgorithm = "sha256"
): string {
  return createHmac(algorithm, secret).update(rawBody).digest("hex");
}

/**
 * Strip an optional `algo=` prefix (e.g. GitHub/Meta send `sha256=<hex>`) and
 * return the bare hex digest, lower-cased.
 */
export function normalizeSignature(signature: string): string {
  const idx = signature.indexOf("=");
  const hex = idx >= 0 ? signature.slice(idx + 1) : signature;
  return hex.trim().toLowerCase();
}

/**
 * Constant-time verify that `signature` matches `HMAC(secret, rawBody)`.
 * Accepts an optional `algo=` prefix. Returns false for any malformed input
 * rather than throwing.
 */
export function verifySignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
  algorithm: HmacAlgorithm = "sha256"
): boolean {
  if (typeof signature !== "string" || signature.length === 0) return false;
  if (typeof secret !== "string" || secret.length === 0) return false;

  const provided = normalizeSignature(signature);
  if (!/^[0-9a-f]+$/.test(provided)) return false;

  const expected = computeSignature(rawBody, secret, algorithm);
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
