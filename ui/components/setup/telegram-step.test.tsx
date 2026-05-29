import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TelegramStep } from "./telegram-step";
import * as setupApi from "@/lib/setup";

afterEach(() => {
  vi.restoreAllMocks();
});

function fillForm() {
  fireEvent.change(screen.getByLabelText("Bot token"), { target: { value: "123:abc" } });
  fireEvent.change(screen.getByLabelText("Admin chat id"), { target: { value: "42" } });
}

describe("TelegramStep", () => {
  it("verifies and calls onVerified on success", async () => {
    const spy = vi
      .spyOn(setupApi, "verifyTelegram")
      .mockResolvedValue({ valid: true, stored: true, botUsername: "mybot" });
    const onVerified = vi.fn();
    render(<TelegramStep verified={false} onVerified={onVerified} />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Verify & save" }));
    await waitFor(() => expect(onVerified).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ botToken: "123:abc", adminChatId: "42" });
    expect(screen.getByRole("status")).toHaveTextContent("@mybot");
  });

  it("shows the reason on a rejected token", async () => {
    vi.spyOn(setupApi, "verifyTelegram").mockResolvedValue({
      valid: false,
      reason: "bad token"
    });
    const onVerified = vi.fn();
    render(<TelegramStep verified={false} onVerified={onVerified} />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Verify & save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("bad token");
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("reports a server error", async () => {
    vi.spyOn(setupApi, "verifyTelegram").mockRejectedValue(new Error("down"));
    render(<TelegramStep verified={false} onVerified={vi.fn()} />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Verify & save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
  });

  it("disables submit until both fields are filled", () => {
    render(<TelegramStep verified={false} onVerified={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Verify & save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Bot token"), { target: { value: "t" } });
    expect(screen.getByRole("button", { name: "Verify & save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Admin chat id"), { target: { value: "1" } });
    expect(screen.getByRole("button", { name: "Verify & save" })).toBeEnabled();
  });

  it("renders the success state when already verified", () => {
    render(<TelegramStep verified onVerified={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/check telegram/i);
  });
});
