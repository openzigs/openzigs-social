/**
 * SSRF guard for user-supplied base URLs (setup wizard, sub #103).
 *
 * The OpenAI-compatible provider lets the user paste an arbitrary base URL.
 * Before the server makes a validation request to it we treat that URL as
 * untrusted and refuse to call obviously dangerous targets: non-http(s)
 * schemes, localhost/loopback, link-local (incl. the cloud metadata address
 * 169.254.169.254), and RFC 1918 private ranges.
 *
 * This is a best-effort guard for the v1 skeleton. It blocks literal private
 * hosts but does NOT resolve DNS to catch names that point at private IPs —
 * that limitation is documented and acceptable for the minimal wizard.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

/** True for IPv4 literals inside loopback / link-local / RFC 1918 ranges. */
function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const octets = m.slice(1).map((o) => Number(o));
  if (octets.some((o) => o > 255)) return false;
  const [a, b] = octets as [number, number, number, number];
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

/** True for IPv6 loopback / unspecified / unique-local / link-local. */
function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // fc00::/7 ULA
  if (h.startsWith("fe80")) return true; // link-local
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
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
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
