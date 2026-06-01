import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DecisionLog } from "./decision-log";
import type { AutoReplyAudit } from "@/lib/auto-reply";

function audit(overrides: Partial<AutoReplyAudit> = {}): AutoReplyAudit {
  return {
    id: 1,
    threadId: "t-1",
    platform: "twitter",
    prompt: "hello?",
    draftText: "hi there",
    confidence: 0.92,
    voiceMatch: 0.85,
    toneMatch: 0.85,
    bannedHits: [],
    decision: "auto_send",
    humanOverride: false,
    outcome: "sent",
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

describe("DecisionLog", () => {
  it("shows an empty state", () => {
    render(<DecisionLog audits={[]} />);
    expect(screen.getByText(/no auto-reply decisions yet/i)).toBeInTheDocument();
  });

  it("shows a loading state", () => {
    render(<DecisionLog audits={[]} loading />);
    expect(screen.getByText(/loading decision log/i)).toBeInTheDocument();
  });

  it("surfaces BOTH the confidence and voice scores as percentages", () => {
    render(<DecisionLog audits={[audit()]} />);
    const row = screen.getByTestId("audit-1");
    expect(row).toHaveTextContent("confidence");
    expect(row).toHaveTextContent("92%");
    expect(row).toHaveTextContent("voice");
    expect(row).toHaveTextContent("85%");
    expect(row).toHaveTextContent("sent");
  });

  it("does not render approve/reject for resolved rows", () => {
    render(<DecisionLog audits={[audit({ outcome: "sent" })]} onResolve={() => {}} />);
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("approves a pending draft as-is (no edit → no override flag passed)", () => {
    const onResolve = vi.fn();
    render(
      <DecisionLog
        audits={[audit({ outcome: "pending", decision: "queue", confidence: 0.5 })]}
        onResolve={onResolve}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onResolve).toHaveBeenCalledWith(1, true, undefined);
  });

  it("passes the edited text on approve when changed", () => {
    const onResolve = vi.fn();
    render(<DecisionLog audits={[audit({ outcome: "pending" })]} onResolve={onResolve} />);
    fireEvent.change(screen.getByLabelText(/edit draft for thread t-1/i), {
      target: { value: "human reply" }
    });
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onResolve).toHaveBeenCalledWith(1, true, "human reply");
  });

  it("rejects a pending draft", () => {
    const onResolve = vi.fn();
    render(<DecisionLog audits={[audit({ outcome: "pending" })]} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onResolve).toHaveBeenCalledWith(1, false);
  });

  it("flags banned-word hits and human overrides", () => {
    render(<DecisionLog audits={[audit({ bannedHits: ["spam"], humanOverride: true })]} />);
    const row = screen.getByTestId("audit-1");
    expect(row).toHaveTextContent("banned: spam");
    expect(row).toHaveTextContent("human override");
  });
});
