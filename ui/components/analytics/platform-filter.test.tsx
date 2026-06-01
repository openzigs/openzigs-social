import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlatformFilter } from "./platform-filter";

describe("PlatformFilter", () => {
  it("offers an All pill plus one per platform and marks the selection", () => {
    render(
      <PlatformFilter
        platforms={["instagram", "linkedin"]}
        selected="instagram"
        onSelect={vi.fn()}
      />
    );
    const group = screen.getByRole("group", { name: "Filter by platform" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All platforms" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    const pills = screen.getAllByRole("button");
    const active = pills.find((p) => p.getAttribute("aria-pressed") === "true");
    expect(active).toBeDefined();
  });

  it("emits the platform key when a pill is clicked and undefined for All", () => {
    const onSelect = vi.fn();
    render(<PlatformFilter platforms={["instagram"]} selected={undefined} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole("button")[1]!);
    expect(onSelect).toHaveBeenCalledWith("instagram");

    fireEvent.click(screen.getByRole("button", { name: "All platforms" }));
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });
});
