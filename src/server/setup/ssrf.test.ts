import { describe, expect, it } from "vitest";

import { assertSafeUrl, isSafeUrl } from "./ssrf.js";

describe("assertSafeUrl", () => {
  it("accepts public https URLs", () => {
    expect(assertSafeUrl("https://api.groq.com/openai/v1").hostname).toBe("api.groq.com");
    expect(isSafeUrl("http://example.com:8080/v1")).toBe(true);
  });

  it("rejects non-http(s) schemes", () => {
    expect(() => assertSafeUrl("ftp://example.com")).toThrow(/http or https/);
    expect(() => assertSafeUrl("file:///etc/passwd")).toThrow(/http or https/);
  });

  it("rejects malformed URLs", () => {
    expect(() => assertSafeUrl("not a url")).toThrow(/valid URL/);
    expect(isSafeUrl("::::")).toBe(false);
  });

  it("blocks localhost and loopback", () => {
    expect(isSafeUrl("http://localhost/v1")).toBe(false);
    expect(isSafeUrl("http://127.0.0.1/v1")).toBe(false);
    expect(isSafeUrl("http://127.5.5.5/v1")).toBe(false);
    expect(isSafeUrl("http://[::1]/v1")).toBe(false);
  });

  it("blocks the cloud metadata link-local address", () => {
    expect(isSafeUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
  });

  it("blocks RFC 1918 private ranges", () => {
    expect(isSafeUrl("http://10.0.0.1/v1")).toBe(false);
    expect(isSafeUrl("http://192.168.1.1/v1")).toBe(false);
    expect(isSafeUrl("http://172.16.0.1/v1")).toBe(false);
    expect(isSafeUrl("http://172.31.255.255/v1")).toBe(false);
    expect(isSafeUrl("http://0.0.0.0/v1")).toBe(false);
  });

  it("allows 172.x addresses outside the private block", () => {
    expect(isSafeUrl("http://172.32.0.1/v1")).toBe(true);
    expect(isSafeUrl("http://172.15.0.1/v1")).toBe(true);
  });

  it("treats numeric-looking hosts that fail IPv4 parsing as invalid URLs", () => {
    // The WHATWG URL parser rejects 999.1.1.1 (octet > 255 during IPv4 parse).
    expect(isSafeUrl("http://999.1.1.1/v1")).toBe(false);
  });

  it("blocks .local mDNS names and IPv6 ULA/link-local", () => {
    expect(isSafeUrl("http://printer.local/v1")).toBe(false);
    expect(isSafeUrl("http://[fc00::1]/v1")).toBe(false);
    expect(isSafeUrl("http://[fe80::1]/v1")).toBe(false);
    expect(isSafeUrl("http://[::]/v1")).toBe(false);
  });
});
