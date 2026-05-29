import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DashboardDialog } from "./dashboard-dialog";

describe("DashboardDialog", () => {
  it("renders a trigger button", () => {
    render(<DashboardDialog />);
    expect(screen.getByRole("button", { name: /quick actions/i })).toBeInTheDocument();
  });

  it("opens the dialog and shows its content", async () => {
    const user = userEvent.setup();
    render(<DashboardDialog />);
    await user.click(screen.getByRole("button", { name: /quick actions/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /quick actions/i })).toBeInTheDocument();
  });
});
