import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TourOverlay } from "./tour-overlay";
import { dismissTourSection, relaunchTour } from "@/lib/onboarding";

beforeEach(() => {
  localStorage.clear();
  relaunchTour();
});

afterEach(() => {
  localStorage.clear();
});

describe("TourOverlay", () => {
  it("renders the coach-mark for a section", () => {
    render(<TourOverlay section="inbox" />);
    expect(screen.getByRole("dialog", { name: /inbox tour/i })).toBeInTheDocument();
  });

  it("hides after dismissal", () => {
    const { rerender } = render(<TourOverlay section="scheduler" />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss tour/i }));
    rerender(<TourOverlay section="scheduler" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays hidden when already dismissed", () => {
    dismissTourSection("brand-voice");
    render(<TourOverlay section="brand-voice" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reappears after a re-launch", () => {
    dismissTourSection("inbox");
    const { rerender } = render(<TourOverlay section="inbox" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    relaunchTour();
    rerender(<TourOverlay section="inbox" />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
