import { describe, expect, it } from "vitest";

import {
  buildDmUsage,
  buildPrivacyMessage,
  buildStartMessage,
  buildStatusMessage
} from "./commands.js";

describe("command message builders", () => {
  it("buildStartMessage includes the bot handle when known", () => {
    expect(buildStartMessage("ozbot")).toContain("@ozbot");
    expect(buildStartMessage()).toContain("openzigs-social");
  });

  it("buildStartMessage lists the core commands", () => {
    const msg = buildStartMessage();
    for (const cmd of ["/status", "/queue", "/privacy", "/dm"]) {
      expect(msg).toContain(cmd);
    }
  });

  it("buildStatusMessage reflects pending count and dm availability", () => {
    expect(buildStatusMessage({ pendingApprovals: 3, dmAvailable: true })).toContain(
      "Pending approvals: 3"
    );
    expect(buildStatusMessage({ pendingApprovals: 0, dmAvailable: true })).toContain("available");
    expect(buildStatusMessage({ pendingApprovals: 0, dmAvailable: false })).toContain(
      "no platform connected"
    );
  });

  it("buildPrivacyMessage describes local-first storage and ACL posture", () => {
    const msg = buildPrivacyMessage();
    expect(msg).toContain("encrypted");
    expect(msg).toContain("admin chat");
  });

  it("buildDmUsage echoes the reason and usage line", () => {
    const msg = buildDmUsage("missing message");
    expect(msg).toContain("missing message");
    expect(msg).toContain("Usage: /dm <platform> <recipient> <message>");
  });
});
