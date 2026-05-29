import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pathnameMock = vi.fn(() => "/inbox");
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock()
}));

import { ThemeProvider } from "./theme-provider";
import { TopNav } from "./top-nav";

function renderNav() {
  return render(
    <ThemeProvider>
      <TopNav />
    </ThemeProvider>
  );
}

describe("TopNav", () => {
  beforeEach(() => {
    localStorage.clear();
    pathnameMock.mockReturnValue("/inbox");
  });

  it("renders all six primary route links", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: /primary/i });
    for (const label of ["Inbox", "Compose", "Calendar", "Analytics", "Contacts", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
      expect(nav).toHaveTextContent(label);
    }
  });

  it("links to the correct hrefs", () => {
    renderNav();
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/inbox");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("marks the active route with aria-current", () => {
    renderNav();
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Compose" })).not.toHaveAttribute("aria-current");
  });

  it("renders the brand link and theme toggle", () => {
    renderNav();
    expect(screen.getByRole("button", { name: /toggle theme/i })).toBeInTheDocument();
  });
});
