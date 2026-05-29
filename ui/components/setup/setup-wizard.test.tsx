import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SetupWizard } from "./setup-wizard";
import { WIZARD_STORAGE_KEY } from "@/lib/setup";

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/validate-key")) {
      return new Response(JSON.stringify({ valid: true, provider: "openai", stored: true }), {
        status: 200
      });
    }
    if (url.includes("/telegram/verify")) {
      return new Response(JSON.stringify({ valid: true, stored: true, botUsername: "bot" }), {
        status: 200
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
}

describe("SetupWizard", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts on the welcome step with a progress indicator", () => {
    render(<SetupWizard />);
    expect(screen.getByText("Welcome to openzigs-social")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /setup progress/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("walks through all three steps to completion", async () => {
    mockFetch();
    render(<SetupWizard />);

    // Step 0 -> 1
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Connect your AI provider")).toBeInTheDocument();
    // Next is gated until the provider validates.
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-x" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate & save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());

    // Step 1 -> 2
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Connect your Telegram bot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Bot token"), { target: { value: "123:abc" } });
    fireEvent.change(screen.getByLabelText("Admin chat id"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify & save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Finish" })).toBeEnabled());

    // Finish
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByText("You're all set")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute("href", "/");
    // Completion clears persisted progress.
    expect(localStorage.getItem(WIZARD_STORAGE_KEY)).toBeNull();
  });

  it("can navigate back to a previous step", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Connect your AI provider")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Welcome to openzigs-social")).toBeInTheDocument();
  });

  it("restores persisted progress across remounts", async () => {
    const first = render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("Connect your AI provider")).toBeInTheDocument());
    first.unmount();

    render(<SetupWizard />);
    expect(await screen.findByText("Connect your AI provider")).toBeInTheDocument();
  });

  it("resets validation when switching provider", async () => {
    mockFetch();
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-x" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate & save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    fireEvent.click(screen.getByRole("radio", { name: "Anthropic" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
