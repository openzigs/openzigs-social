import { describe, expect, it } from "vitest";

import { ConnectorRegistry, type OAuthTokenExchanger } from "./connector-registry.js";

function exchanger(platform: string): OAuthTokenExchanger {
  return {
    platform,
    exchangeCode: async () => ({ accessToken: "t" })
  };
}

describe("ConnectorRegistry", () => {
  it("registers and looks up exchangers case-insensitively", () => {
    const reg = new ConnectorRegistry();
    reg.register(exchanger("Instagram"));
    expect(reg.has("instagram")).toBe(true);
    expect(reg.has("INSTAGRAM")).toBe(true);
    expect(reg.get("instagram")?.platform).toBe("Instagram");
    expect(reg.platforms()).toEqual(["instagram"]);
  });

  it("rejects duplicate registrations", () => {
    const reg = new ConnectorRegistry();
    reg.register(exchanger("x"));
    expect(() => reg.register(exchanger("x"))).toThrow(/already registered/);
  });

  it("rejects invalid platform keys", () => {
    const reg = new ConnectorRegistry();
    expect(() => reg.register(exchanger("-bad"))).toThrow(/invalid platform/);
    expect(() => reg.register(exchanger("bad key!"))).toThrow(/invalid platform/);
  });

  it("returns undefined for unknown platforms", () => {
    const reg = new ConnectorRegistry();
    expect(reg.get("nope")).toBeUndefined();
    expect(reg.has("nope")).toBe(false);
  });
});
