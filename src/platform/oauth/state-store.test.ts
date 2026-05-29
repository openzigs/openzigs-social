import { describe, expect, it } from "vitest";

import { OAuthStateStore } from "./state-store.js";

function fakeClock() {
  let t = 1_000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("OAuthStateStore", () => {
  it("issues opaque, unique states", () => {
    const store = new OAuthStateStore();
    const a = store.issue("x");
    const b = store.issue("x");
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
    expect(store.size).toBe(2);
  });

  it("consumes a valid state exactly once (single-use)", () => {
    const store = new OAuthStateStore();
    const state = store.issue("instagram", { return: "/inbox" });
    const record = store.consume("instagram", state);
    expect(record?.platform).toBe("instagram");
    expect(record?.metadata).toEqual({ return: "/inbox" });
    // Replay fails.
    expect(store.consume("instagram", state)).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it("rejects a state bound to a different platform", () => {
    const store = new OAuthStateStore();
    const state = store.issue("x");
    expect(store.consume("youtube", state)).toBeUndefined();
  });

  it("rejects empty / unknown states", () => {
    const store = new OAuthStateStore();
    expect(store.consume("x", "")).toBeUndefined();
    expect(store.consume("x", "nope")).toBeUndefined();
  });

  it("rejects expired states and prunes them", () => {
    const clock = fakeClock();
    const store = new OAuthStateStore({ ttlMs: 1000, now: clock.now });
    const state = store.issue("x");
    clock.advance(1001);
    expect(store.consume("x", state)).toBeUndefined();
  });

  it("prune removes only expired records", () => {
    const clock = fakeClock();
    const store = new OAuthStateStore({ ttlMs: 1000, now: clock.now });
    store.issue("x");
    clock.advance(1001);
    const fresh = store.issue("y");
    expect(store.prune()).toBe(1);
    expect(store.size).toBe(1);
    expect(store.consume("y", fresh)?.platform).toBe("y");
  });
});
