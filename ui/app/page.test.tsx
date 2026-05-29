import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DashboardPage from "./page";

describe("DashboardPage", () => {
  it("renders the dashboard heading", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("renders the four KPI tiles", () => {
    render(<DashboardPage />);
    const kpis = screen.getByRole("region", {
      name: /key performance indicators/i
    });
    for (const title of ["Scheduled posts", "Unread inbox", "Engagement", "Contacts"]) {
      expect(kpis).toHaveTextContent(title);
    }
  });

  it("renders the quick-actions dialog trigger", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("button", { name: /quick actions/i })).toBeInTheDocument();
  });
});
