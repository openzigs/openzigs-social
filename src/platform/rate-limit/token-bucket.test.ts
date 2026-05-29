import { describe, expect, it } from "vitest";

import { TokenBucket } from "./token-bucket.js";

function fakeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("TokenBucket", () => {
  it("rejects invalid configuration", () => {
    expect(() => new TokenBucket({ capacity: 0, refillPerSec: 1 })).toThrow();
    expect(() => new TokenBucket({ capacity: 1, refillPerSec: -1 })).toThrow();
  });

  it("starts full and consumes tokens", () => {
    const clock = fakeClock();
    const b = new TokenBucket({ capacity: 3, refillPerSec: 1, now: clock.now });
    expect(b.available()).toBe(3);
    expect(b.tryConsume(2)).toBe(true);
    expect(b.available()).toBe(1);
    expect(b.tryConsume(2)).toBe(false);
  });

  it("treats a non-positive cost as a free no-op success", () => {
    const b = new TokenBucket({ capacity: 1, refillPerSec: 1 });
    expect(b.tryConsume(0)).toBe(true);
    expect(b.available()).toBe(1);
  });

  it("refills continuously based on elapsed time, capped at capacity", () => {
    const clock = fakeClock();
    const b = new TokenBucket({ capacity: 10, refillPerSec: 5, now: clock.now });
    b.tryConsume(10);
    expect(b.available()).toBe(0);
    clock.advance(1000); // +5 tokens
    expect(b.available()).toBe(5);
    clock.advance(10_000); // would be +50, capped at capacity
    expect(b.available()).toBe(10);
  });

  it("honours initialTokens", () => {
    const b = new TokenBucket({ capacity: 10, refillPerSec: 1, initialTokens: 2 });
    expect(b.available()).toBe(2);
  });

  it("reports utilisation", () => {
    const clock = fakeClock();
    const b = new TokenBucket({ capacity: 10, refillPerSec: 0, now: clock.now });
    expect(b.utilization()).toBe(0);
    b.tryConsume(8);
    expect(b.utilization()).toBeCloseTo(0.8, 5);
  });

  it("computes msUntilAvailable", () => {
    const clock = fakeClock();
    const b = new TokenBucket({ capacity: 2, refillPerSec: 1, now: clock.now });
    expect(b.msUntilAvailable(1)).toBe(0);
    b.tryConsume(2);
    expect(b.msUntilAvailable(1)).toBe(1000);
    expect(b.msUntilAvailable(2)).toBe(2000);
  });

  it("returns Infinity when a non-refilling bucket lacks tokens", () => {
    const b = new TokenBucket({ capacity: 1, refillPerSec: 0 });
    b.tryConsume(1);
    expect(b.msUntilAvailable(1)).toBe(Infinity);
  });
});
