import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderStep } from "./provider-step";
import * as setupApi from "@/lib/setup";

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(overrides: Partial<React.ComponentProps<typeof ProviderStep>> = {}) {
  const onProviderChange = vi.fn();
  const onValidated = vi.fn();
  render(
    <ProviderStep
      provider="openai"
      validated={false}
      onProviderChange={onProviderChange}
      onValidated={onValidated}
      {...overrides}
    />
  );
  return { onProviderChange, onValidated };
}

describe("ProviderStep", () => {
  it("switches the selected provider", () => {
    const { onProviderChange } = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Anthropic" }));
    expect(onProviderChange).toHaveBeenCalledWith("anthropic");
  });

  it("shows the base URL field only for openai-compatible", () => {
    const { rerender } = render(
      <ProviderStep
        provider="openai"
        validated={false}
        onProviderChange={vi.fn()}
        onValidated={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument();
    rerender(
      <ProviderStep
        provider="openai-compatible"
        validated={false}
        onProviderChange={vi.fn()}
        onValidated={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Base URL")).toBeInTheDocument();
  });

  it("validates and calls onValidated on success", async () => {
    const spy = vi
      .spyOn(setupApi, "validateProviderKey")
      .mockResolvedValue({ valid: true, provider: "openai", stored: true });
    const { onValidated } = setup();
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-test" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate & save" }));
    await waitFor(() => expect(onValidated).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ provider: "openai", apiKey: "sk-test" });
    expect(screen.getByRole("status")).toHaveTextContent(/validated and saved/i);
  });

  it("shows the reason on a rejected key", async () => {
    vi.spyOn(setupApi, "validateProviderKey").mockResolvedValue({
      valid: false,
      reason: "invalid key"
    });
    const { onValidated } = setup();
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate & save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid key");
    expect(onValidated).not.toHaveBeenCalled();
  });

  it("reports a server error", async () => {
    vi.spyOn(setupApi, "validateProviderKey").mockRejectedValue(new Error("network"));
    setup();
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate & save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
  });

  it("includes baseUrl in the payload for openai-compatible", async () => {
    const spy = vi.spyOn(setupApi, "validateProviderKey").mockResolvedValue({ valid: true });
    setup({ provider: "openai-compatible" });
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "k" } });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://api.example.com/v1" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate & save" }));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        provider: "openai-compatible",
        apiKey: "k",
        baseUrl: "https://api.example.com/v1"
      })
    );
  });

  it("renders the success state when already validated", () => {
    setup({ validated: true });
    expect(screen.getByRole("status")).toHaveTextContent(/validated and saved/i);
  });
});
