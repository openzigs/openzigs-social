import { describe, expect, it } from "vitest";

import { VaultSchema, ProviderCredentialSchema, OAuthCredentialSchema } from "./types.js";

describe("vault schemas", () => {
  it("ProviderCredentialSchema accepts only known keys", () => {
    expect(ProviderCredentialSchema.parse({ apiKey: "k" })).toEqual({ apiKey: "k" });
    expect(() => ProviderCredentialSchema.parse({ apiKey: "" })).toThrow();
    expect(() => ProviderCredentialSchema.parse({ surprise: true } as never)).toThrow();
  });

  it("OAuthCredentialSchema requires an access token", () => {
    expect(() => OAuthCredentialSchema.parse({})).toThrow();
    expect(OAuthCredentialSchema.parse({ accessToken: "t" }).accessToken).toBe("t");
  });

  it("VaultSchema fills defaults", () => {
    const v = VaultSchema.parse({});
    expect(v.version).toBe(1);
    expect(v.providers).toEqual({});
    expect(v.oauth).toEqual({});
  });
});
