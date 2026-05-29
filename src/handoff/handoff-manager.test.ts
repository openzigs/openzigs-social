import { describe, expect, it, vi } from "vitest";

import { HandoffManager, type OwnershipChange } from "./handoff-manager.js";

describe("HandoffManager", () => {
  it("defaults a thread to ai ownership", () => {
    const handoff = new HandoffManager();
    expect(handoff.owner("t1")).toBe("ai");
    expect(handoff.isHumanOwned("t1")).toBe(false);
    expect(handoff.list()).toEqual([]);
  });

  it("takeOver aborts a registered in-flight controller and flips ownership", () => {
    const handoff = new HandoffManager();
    const { controller } = handoff.register("t1");
    expect(controller.signal.aborted).toBe(false);

    handoff.takeOver("t1");

    // Abort is synchronous — well within the 2s requirement.
    expect(controller.signal.aborted).toBe(true);
    expect(handoff.isHumanOwned("t1")).toBe(true);
    expect(handoff.owner("t1")).toBe("human");
  });

  it("aborts every controller registered for a thread on takeOver", () => {
    const handoff = new HandoffManager();
    const a = handoff.register("t1").controller;
    const b = handoff.register("t1").controller;
    const other = handoff.register("t2").controller;

    handoff.takeOver("t1");

    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
    expect(other.signal.aborted).toBe(false);
  });

  it("fires the AbortSignal abort event on takeOver", () => {
    const handoff = new HandoffManager();
    const { controller } = handoff.register("t1");
    const onAbort = vi.fn();
    controller.signal.addEventListener("abort", onAbort);

    handoff.takeOver("t1");
    expect(onAbort).toHaveBeenCalledOnce();
  });

  it("accepts a caller-provided AbortController", () => {
    const handoff = new HandoffManager();
    const mine = new AbortController();
    const { controller } = handoff.register("t1", mine);
    expect(controller).toBe(mine);

    handoff.takeOver("t1");
    expect(mine.signal.aborted).toBe(true);
  });

  it("emits an ownership.change event with previous/new owner on takeOver", () => {
    const handoff = new HandoffManager({ now: () => 1234 });
    const changes: OwnershipChange[] = [];
    handoff.on("ownership.change", (c) => changes.push(c));

    handoff.takeOver("t1", "manual");

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      threadId: "t1",
      owner: "human",
      previous: "ai",
      reason: "manual",
      at: 1234
    });
  });

  it("takeOver is idempotent — at most one change event", () => {
    const handoff = new HandoffManager();
    const onChange = vi.fn();
    handoff.on("ownership.change", onChange);

    handoff.takeOver("t1");
    handoff.takeOver("t1");

    expect(onChange).toHaveBeenCalledOnce();
    expect(handoff.isHumanOwned("t1")).toBe(true);
  });

  it("release returns a thread to ai ownership and emits a change", () => {
    const handoff = new HandoffManager();
    const changes: OwnershipChange[] = [];
    handoff.on("ownership.change", (c) => changes.push(c));

    handoff.takeOver("t1");
    handoff.release("t1", "resolved");

    expect(handoff.owner("t1")).toBe("ai");
    expect(changes).toHaveLength(2);
    expect(changes[1]).toMatchObject({ owner: "ai", previous: "human", reason: "resolved" });
  });

  it("release is a no-op for a thread that isn't human-owned", () => {
    const handoff = new HandoffManager();
    const onChange = vi.fn();
    handoff.on("ownership.change", onChange);
    handoff.release("t1");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("immediately aborts a controller registered on an already human-owned thread", () => {
    const handoff = new HandoffManager();
    handoff.takeOver("t1");

    const { controller } = handoff.register("t1");
    expect(controller.signal.aborted).toBe(true);
  });

  it("unregister removes a controller so takeOver does not abort it", () => {
    const handoff = new HandoffManager();
    const { controller, unregister } = handoff.register("t1");
    unregister();

    handoff.takeOver("t1");
    expect(controller.signal.aborted).toBe(false);
  });

  it("list reflects all human-owned threads", () => {
    const handoff = new HandoffManager();
    handoff.takeOver("t1");
    handoff.takeOver("t2");
    handoff.release("t1");

    expect(handoff.list()).toEqual([{ threadId: "t2", owner: "human" }]);
  });

  it("rejects an invalid threadId at the boundary", () => {
    const handoff = new HandoffManager();
    expect(() => handoff.takeOver("")).toThrow(/non-empty string/);
    // @ts-expect-error invalid type
    expect(() => handoff.register(123)).toThrow(/non-empty string/);
  });
});
