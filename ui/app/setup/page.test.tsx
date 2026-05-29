import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import SetupPage from "./page";

describe("SetupPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the heading and the wizard", () => {
    render(<SetupPage />);
    expect(screen.getByRole("heading", { name: "Setup" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /setup progress/i })).toBeInTheDocument();
  });
});
