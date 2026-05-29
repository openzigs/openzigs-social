import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StepIndicator } from "./step-indicator";

const LABELS = ["Welcome", "AI provider", "Telegram"] as const;

describe("StepIndicator", () => {
  it("marks the current step with aria-current", () => {
    render(<StepIndicator current={1} labels={LABELS} />);
    const current = screen.getByText("2");
    expect(current).toHaveAttribute("aria-current", "step");
  });

  it("renders a check for completed steps and the number for upcoming ones", () => {
    render(<StepIndicator current={2} labels={LABELS} />);
    // Step 3 (index 2) is current and shows its number.
    expect(screen.getByText("3")).toBeInTheDocument();
    // Steps 1 and 2 are complete, so their numbers are replaced by check icons.
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("exposes overall progress via aria-label", () => {
    render(<StepIndicator current={0} labels={LABELS} />);
    expect(screen.getByRole("list")).toHaveAttribute("aria-label", "Setup progress: step 1 of 3");
  });
});
