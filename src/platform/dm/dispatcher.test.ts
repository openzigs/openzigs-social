import { describe, expect, it, vi } from "vitest";

import { ApprovalQueue } from "../../approvals/index.js";
import { HandoffManager } from "../../handoff/index.js";
import { DmDispatcher, approvalGatedReply, humanOwnedGuard, type InboundDm } from "./dispatcher.js";

function message(overrides: Partial<InboundDm> = {}): InboundDm {
  return {
    platform: "instagram",
    threadId: "t1",
    messageId: "m1",
    text: "hello",
    from: "alice",
    receivedAt: 1000,
    ...overrides
  };
}

describe("DmDispatcher", () => {
  it("emits inbox:message and runs the full chain in order", async () => {
    const emit = vi.fn();
    const handoff = new HandoffManager();
    const approvals = new ApprovalQueue();
    const order: string[] = [];
    const dispatcher = new DmDispatcher({ handoff, approvals, emit })
      .use(() => void order.push("a"))
      .use(() => void order.push("b"));

    const result = await dispatcher.dispatch(message());
    expect(result).toEqual({ completed: true, rulesRun: 2 });
    expect(order).toEqual(["a", "b"]);
    expect(emit).toHaveBeenCalledWith(
      "inbox:message",
      expect.objectContaining({ platform: "instagram", threadId: "t1", text: "hello" })
    );
  });

  it("stops the chain when a rule calls ctx.stop()", async () => {
    const dispatcher = new DmDispatcher({
      handoff: new HandoffManager(),
      approvals: new ApprovalQueue(),
      emit: vi.fn()
    })
      .use((ctx) => ctx.stop())
      .use(() => {
        throw new Error("should not run");
      });
    const result = await dispatcher.dispatch(message());
    expect(result).toEqual({ completed: false, rulesRun: 1 });
  });

  it("passes state between rules", async () => {
    const seen: unknown[] = [];
    const dispatcher = new DmDispatcher({
      handoff: new HandoffManager(),
      approvals: new ApprovalQueue(),
      emit: vi.fn()
    })
      .use((ctx) => {
        ctx.state.tag = "x";
      })
      .use((ctx) => seen.push(ctx.state.tag));
    await dispatcher.dispatch(message());
    expect(seen).toEqual(["x"]);
  });

  describe("humanOwnedGuard", () => {
    it("stops processing on a human-owned thread", async () => {
      const handoff = new HandoffManager();
      handoff.takeOver("t1", "manual");
      const emit = vi.fn();
      const after = vi.fn();
      const dispatcher = new DmDispatcher({ handoff, approvals: new ApprovalQueue(), emit })
        .use(humanOwnedGuard())
        .use(after);
      const result = await dispatcher.dispatch(message());
      expect(result.completed).toBe(false);
      expect(after).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith(
        "inbox:skipped",
        expect.objectContaining({ threadId: "t1", reason: "human-owned" })
      );
    });

    it("lets AI-owned threads continue", async () => {
      const handoff = new HandoffManager();
      const after = vi.fn();
      const dispatcher = new DmDispatcher({
        handoff,
        approvals: new ApprovalQueue(),
        emit: vi.fn()
      })
        .use(humanOwnedGuard())
        .use(after);
      const result = await dispatcher.dispatch(message());
      expect(result.completed).toBe(true);
      expect(after).toHaveBeenCalledOnce();
    });
  });

  describe("approvalGatedReply", () => {
    it("sends the draft after approval", async () => {
      const approvals = new ApprovalQueue();
      const onApproved = vi.fn();
      const dispatcher = new DmDispatcher({
        handoff: new HandoffManager(),
        approvals,
        emit: vi.fn()
      }).use(
        approvalGatedReply({
          draft: () => "drafted reply",
          onApproved
        })
      );

      // Approve the next request as soon as it is queued.
      approvals.on("request", (pending: { id: string }) => {
        approvals.decide(pending.id, "approve");
      });

      await dispatcher.dispatch(message());
      expect(onApproved).toHaveBeenCalledWith("drafted reply", expect.anything());
    });

    it("honours a reviewer-edited draft", async () => {
      const approvals = new ApprovalQueue();
      const onApproved = vi.fn();
      const dispatcher = new DmDispatcher({
        handoff: new HandoffManager(),
        approvals,
        emit: vi.fn()
      }).use(approvalGatedReply({ draft: () => "original", onApproved }));

      approvals.on("request", (pending: { id: string }) => {
        approvals.decide(pending.id, "approve", { draft: "edited" });
      });
      await dispatcher.dispatch(message());
      expect(onApproved).toHaveBeenCalledWith("edited", expect.anything());
    });

    it("does not send when the reviewer rejects", async () => {
      const approvals = new ApprovalQueue();
      const onApproved = vi.fn();
      const dispatcher = new DmDispatcher({
        handoff: new HandoffManager(),
        approvals,
        emit: vi.fn()
      }).use(approvalGatedReply({ draft: () => "x", onApproved }));

      approvals.on("request", (pending: { id: string }) => {
        approvals.decide(pending.id, "reject");
      });
      await dispatcher.dispatch(message());
      expect(onApproved).not.toHaveBeenCalled();
    });
  });
});
