import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingPanel } from "./onboarding-panel";
import { TourOverlay } from "./tour-overlay";
import {
  completeStep,
  dismissTourSection,
  getProgressSnapshot,
  isTourSectionDismissed,
  relaunchOnboarding,
  skipStep
} from "@/lib/onboarding";

vi.mock("./model-panel", () => ({
  ModelPanel: ({ onComplete }: { onComplete?: () => void }) => (
    <button onClick={onComplete}>model-complete</button>
  )
}));
vi.mock("./social-connect-step", () => ({
  SocialConnectStep: () => <div>social-step</div>
}));
vi.mock("./meta-app-wizard", () => ({ MetaAppWizard: () => <div>meta-step</div> }));
vi.mock("./recipe-picker", () => ({ RecipePicker: () => <div>recipe-step</div> }));
vi.mock("./brand-voice-import", () => ({ BrandVoiceImport: () => <div>brand-step</div> }));

beforeEach(() => {
  localStorage.clear();
  relaunchOnboarding();
});

afterEach(() => {
  localStorage.clear();
});

describe("OnboardingPanel", () => {
  it("renders the model step by default", () => {
    render(<OnboardingPanel />);
    expect(screen.getByRole("heading", { name: /onboarding/i })).toBeInTheDocument();
    expect(screen.getByText("model-complete")).toBeInTheDocument();
  });

  it("marks a step done when the child reports completion", () => {
    render(<OnboardingPanel />);
    fireEvent.click(screen.getByText("model-complete"));
    expect(getProgressSnapshot().completed).toContain("model");
    expect(screen.getByTestId("status-model")).toHaveTextContent("✓");
  });

  it("skips a step", () => {
    render(<OnboardingPanel />);
    fireEvent.click(screen.getAllByRole("button", { name: /skip this step/i })[0]);
    expect(getProgressSnapshot().skipped).toContain("model");
    expect(screen.getByTestId("status-model")).toHaveTextContent("skipped");
  });

  it("switches tabs", async () => {
    const user = userEvent.setup();
    render(<OnboardingPanel />);
    await user.click(screen.getByRole("tab", { name: /connect platforms/i }));
    expect(screen.getByText("social-step")).toBeInTheDocument();
  });

  it("restarts setup, clearing wizard progress", () => {
    completeStep("model");
    skipStep("social");
    render(<OnboardingPanel />);
    fireEvent.click(screen.getByRole("button", { name: /restart setup/i }));
    expect(getProgressSnapshot()).toEqual({ completed: [], skipped: [] });
  });

  it("re-launches the tour, clearing coach-mark dismissals", () => {
    dismissTourSection("inbox");
    render(<OnboardingPanel />);
    fireEvent.click(screen.getByRole("button", { name: /re-launch tour/i }));
    expect(isTourSectionDismissed("inbox")).toBe(false);
  });

  it("re-renders a dismissed tour overlay after re-launching the tour", () => {
    dismissTourSection("inbox");
    render(
      <>
        <OnboardingPanel />
        <TourOverlay section="inbox" />
      </>
    );
    expect(screen.queryByRole("dialog", { name: /inbox tour/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /re-launch tour/i }));

    expect(screen.getByRole("dialog", { name: /inbox tour/i })).toBeInTheDocument();
  });

  it("announces completion once every step is done or skipped", () => {
    for (const step of ["model", "social", "meta", "recipe", "brand-voice"] as const) {
      completeStep(step);
    }
    render(<OnboardingPanel />);
    expect(screen.getByText(/all steps done/i)).toBeInTheDocument();
  });
});
