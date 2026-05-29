import { describe, expect, it } from "vitest";

import { PrivacyController, forcesLocal, isPrivacyMode, PRIVACY_MODES } from "./privacy.js";

describe("privacy mode", () => {
  it("recognises all three modes", () => {
    expect(PRIVACY_MODES).toEqual(["off", "session", "global"]);
    for (const m of PRIVACY_MODES) {
      expect(isPrivacyMode(m)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isPrivacyMode("yolo")).toBe(false);
    expect(isPrivacyMode(42)).toBe(false);
  });

  it("forcesLocal: only `off` allows cloud", () => {
    expect(forcesLocal("off")).toBe(false);
    expect(forcesLocal("session")).toBe(true);
    expect(forcesLocal("global")).toBe(true);
  });

  it("controller defaults to off", () => {
    const c = new PrivacyController();
    expect(c.mode).toBe("off");
    expect(c.forcesLocal()).toBe(false);
  });

  it("controller can be flipped", () => {
    const c = new PrivacyController("off");
    c.set("session");
    expect(c.mode).toBe("session");
    expect(c.forcesLocal()).toBe(true);
  });

  it("assertCloudAllowed throws under global", () => {
    const c = new PrivacyController("global");
    expect(() => c.assertCloudAllowed("openai")).toThrow(/global privacy/);
  });

  it("assertCloudAllowed is a no-op under off/session", () => {
    expect(() => new PrivacyController("off").assertCloudAllowed("x")).not.toThrow();
    expect(() => new PrivacyController("session").assertCloudAllowed("x")).not.toThrow();
  });
});
