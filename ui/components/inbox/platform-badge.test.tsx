import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlatformBadge } from "./platform-badge";

describe("PlatformBadge", () => {
  it("renders the human label for a known platform", () => {
    render(<PlatformBadge platform="instagram" />);
    const badge = screen.getByTestId("platform-badge");
    expect(badge).toHaveTextContent("Instagram");
  });

  it("falls back to the raw platform key for an unknown platform", () => {
    render(<PlatformBadge platform="myspace" />);
    expect(screen.getByTestId("platform-badge")).toHaveTextContent("myspace");
  });

  it("is case-insensitive", () => {
    render(<PlatformBadge platform="LinkedIn" />);
    expect(screen.getByTestId("platform-badge")).toHaveTextContent("LinkedIn");
  });
});
