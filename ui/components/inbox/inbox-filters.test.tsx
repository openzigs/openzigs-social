import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InboxFiltersBar } from "./inbox-filters";

describe("InboxFiltersBar", () => {
  it("renders a platform selector with an all-platforms default", () => {
    render(<InboxFiltersBar filters={{}} onChange={() => {}} />);
    const select = screen.getByLabelText("Filter by platform");
    expect(select).toHaveValue("");
    expect(screen.getByRole("option", { name: "All platforms" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "LinkedIn" })).toBeInTheDocument();
  });

  it("emits a platform filter change", () => {
    const onChange = vi.fn();
    render(<InboxFiltersBar filters={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Filter by platform"), {
      target: { value: "linkedin" }
    });
    expect(onChange).toHaveBeenCalledWith({ platform: "linkedin" });
  });

  it("clears the platform filter when all-platforms is chosen", () => {
    const onChange = vi.fn();
    render(<InboxFiltersBar filters={{ platform: "linkedin" }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Filter by platform"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ platform: undefined });
  });

  it("emits a search filter change", () => {
    const onChange = vi.fn();
    render(<InboxFiltersBar filters={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Search messages"), { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalledWith({ search: "hello" });
  });
});
