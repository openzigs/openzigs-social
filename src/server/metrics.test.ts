import { describe, expect, it, vi } from "vitest";

import { Metrics } from "./metrics.js";

describe("Metrics", () => {
  it("starts empty", () => {
    expect(new Metrics().snapshot()).toEqual({});
  });

  it("increments per-platform counters", () => {
    const m = new Metrics();
    m.recordSent("twitter");
    m.recordSent("twitter");
    m.recordReceived("twitter");
    m.recordFailed("linkedin", 3);
    expect(m.snapshot()).toEqual({
      twitter: { sent: 2, received: 1, failed: 0 },
      linkedin: { sent: 0, received: 0, failed: 3 }
    });
  });

  it("emits update on change", () => {
    const m = new Metrics();
    const spy = vi.fn();
    m.on("update", spy);
    m.recordSent("youtube");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ youtube: { sent: 1, received: 0, failed: 0 } });
  });

  it("snapshot is a copy, not a live reference", () => {
    const m = new Metrics();
    m.recordSent("x");
    const snap = m.snapshot();
    snap.x!.sent = 999;
    expect(m.snapshot().x?.sent).toBe(1);
  });

  it("resets", () => {
    const m = new Metrics();
    m.recordSent("x");
    m.reset();
    expect(m.snapshot()).toEqual({});
  });
});
