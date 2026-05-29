import { describe, it, expect } from "vitest";

import { decrypt, deriveKey, encrypt } from "./crypto.js";

describe("vault crypto", () => {
  it("roundtrips plaintext", () => {
    const key = deriveKey("test-secret");
    const env = encrypt("hello world", key);
    expect(env.v).toBe(1);
    expect(env.ct).not.toContain("hello");
    expect(decrypt(env, key)).toBe("hello world");
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const key = deriveKey("secret");
    const a = encrypt("payload", key);
    const b = encrypt("payload", key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("rejects empty key material", () => {
    expect(() => deriveKey("")).toThrow(/empty/);
  });

  it("rejects an envelope with the wrong version", () => {
    const key = deriveKey("secret");
    const env = encrypt("x", key);
    expect(() => decrypt({ ...env, v: 2 as 1 }, key)).toThrow(/version/);
  });

  it("rejects an envelope with a bad iv length", () => {
    const key = deriveKey("secret");
    const env = encrypt("x", key);
    expect(() => decrypt({ ...env, iv: Buffer.from("short").toString("base64") }, key)).toThrow(
      /iv length/
    );
  });

  it("rejects an envelope with a bad tag length", () => {
    const key = deriveKey("secret");
    const env = encrypt("x", key);
    expect(() => decrypt({ ...env, tag: Buffer.from("short").toString("base64") }, key)).toThrow(
      /tag length/
    );
  });

  it("rejects a tampered ciphertext (auth tag fails)", () => {
    const key = deriveKey("secret");
    const env = encrypt("hello", key);
    const tampered = { ...env, ct: Buffer.from("totally-different").toString("base64") };
    expect(() => decrypt(tampered, key)).toThrow();
  });
});
