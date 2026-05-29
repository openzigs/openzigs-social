/**
 * SSRF guard for user-supplied base URLs (setup wizard, sub #103).
 *
 * The OpenAI-compatible provider lets the user paste an arbitrary base URL.
 * Before the server makes a validation request to it we treat that URL as
 * untrusted and refuse to call obviously dangerous targets: non-http(s)
 * schemes, localhost/loopback, link-local (incl. the cloud metadata address
 * 169.254.169.254), CGNAT, and RFC 1918 private ranges.
 *
 * To defeat obfuscation we canonicalize the host to a dotted-quad IPv4 before
 * the range checks. This catches alternate IPv4 encodings (decimal, hex,
 * octal, short forms) and IPv4-mapped IPv6 literals such as
 * `[::ffff:127.0.0.1]`, all of which otherwise read as "novel" hostnames.
 *
 * KNOWN LIMITATION: this is a literal-host guard. It does NOT resolve DNS, so
 * a hostname that resolves to a private IP (DNS rebinding / TOCTOU between this
 * check and the later fetch) is out of scope for the v1 skeleton. Resolve-and-
 * pin hardening is deferred to #47 / #100.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

/**
 * Parse a single IPv4 "part" the way inet_aton does: decimal by default, hex
 * when prefixed with `0x`, octal when prefixed with a leading `0`. Returns the
 * numeric value, or `null` when the token is not a valid integer in its radix.
 */
function parseIpv4Part(token: string): number | null {
  if (token.length === 0) return null;
  if (/^0x/i.test(token)) {
    const body = token.slice(2);
    if (!/^[0-9a-f]+$/i.test(body)) return null;
    return Number.parseInt(body, 16);
  }
  if (/^0[0-9]+$/.test(token)) {
    const body = token.slice(1);
    if (!/^[0-7]+$/.test(body)) return null; // reject e.g. 08/09
    return Number.parseInt(body, 8);
  }
  if (!/^[0-9]+$/.test(token)) return null;
  return Number.parseInt(token, 10);
}

/**
 * Canonicalize any IPv4 representation (dotted-quad, decimal, hex, octal, and
 * short forms like `127.1`) to a dotted-quad string. Returns `null` when the
 * host is not an IPv4 literal (e.g. a DNS name).
 */
function canonicalizeIpv4(host: string): string | null {
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    const n = parseIpv4Part(part);
    if (n === null || n < 0) return null;
    nums.push(n);
  }
  // inet_aton packing: the final part absorbs the remaining low-order bytes.
  const last = nums[nums.length - 1] as number;
  const leading = nums.slice(0, -1);
  const lastMax = 256 ** (4 - leading.length);
  if (last >= lastMax) return null;
  if (leading.some((n) => n > 255)) return null;
  let value = last;
  for (let i = 0; i < leading.length; i++) {
    value += (leading[i] as number) * 256 ** (3 - i);
  }
  if (value > 0xffffffff) return null;
  return [
    Math.floor(value / 2 ** 24) % 256,
    Math.floor(value / 2 ** 16) % 256,
    Math.floor(value / 2 ** 8) % 256,
    value % 256
  ].join(".");
}

/** True for a canonical dotted-quad inside a blocked range. */
function isPrivateDottedQuad(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = m.slice(1).map((o) => Number(o)) as [number, number, number, number];
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

/** True for any IPv4 literal (in any encoding) inside a blocked range. */
function isPrivateIpv4(host: string): boolean {
  const canonical = canonicalizeIpv4(host);
  if (canonical === null) return false;
  return isPrivateDottedQuad(canonical);
}

/**
 * Extract the embedded IPv4 from an IPv4-mapped IPv6 literal
 * (`::ffff:127.0.0.1` or its hex form `::ffff:7f00:1`). Returns a dotted-quad
 * string, or `null` when the host is not IPv4-mapped.
 */
function mappedIpv4FromIpv6(host: string): string | null {
  if (!host.startsWith("::ffff:")) return null;
  const rest = host.slice("::ffff:".length);
  if (rest.includes(".")) return rest; // already dotted: ::ffff:127.0.0.1
  const groups = rest.split(":");
  if (groups.length !== 2) return null;
  const hi = Number.parseInt(groups[0] as string, 16);
  const lo = Number.parseInt(groups[1] as string, 16);
  if (Number.isNaN(hi) || Number.isNaN(lo) || hi > 0xffff || lo > 0xffff) return null;
  return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join(".");
}

/** True for IPv6 loopback / unspecified / unique-local / link-local / mapped. */
function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // fc00::/7 ULA
  if (h.startsWith("fe80")) return true; // fe80::/10 link-local
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — re-check the embedded IPv4.
  const mapped = mappedIpv4FromIpv6(h);
  if (mapped !== null && isPrivateIpv4(mapped)) return true;
  return false;
}

/**
 * Validate a user-supplied base URL. Returns the parsed {@link URL} when safe,
 * otherwise throws an {@link Error} whose message explains the rejection.
 */
export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("baseUrl is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("baseUrl must use http or https");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error("baseUrl host is not allowed");
  }
  if (host.endsWith(".local")) {
    throw new Error("baseUrl host is not allowed");
  }
  // Bracketed literals are IPv6; everything else may be an IPv4 literal in any
  // encoding (the WHATWG parser preserves numeric/hex/octal hosts as-is).
  const isIpv6Literal = host.startsWith("[") || host.includes(":");
  if (isIpv6Literal ? isPrivateIpv6(host) : isPrivateIpv4(host)) {
    throw new Error("baseUrl host is not allowed");
  }
  return url;
}

/** Non-throwing variant. */
export function isSafeUrl(raw: string): boolean {
  try {
    assertSafeUrl(raw);
    return true;
  } catch {
    return false;
  }
}
