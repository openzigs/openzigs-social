import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TopPostsList } from "./top-posts-list";
import type { TopPost } from "@/lib/analytics";

describe("TopPostsList", () => {
  it("shows a loading hint", () => {
    render(<TopPostsList posts={[]} loading />);
    expect(screen.getByText("Loading top posts…")).toBeInTheDocument();
  });

  it("shows the empty state when there is nothing to rank", () => {
    render(<TopPostsList posts={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("No engagement to rank yet.");
  });

  it("groups ranked posts by platform", () => {
    const posts: TopPost[] = [
      { platform: "instagram", externalId: "ig-1", engagement: 1200, publishedAt: 1, rank: 1 },
      { platform: "linkedin", externalId: "li-1", engagement: 90, publishedAt: null, rank: 1 }
    ];
    render(<TopPostsList posts={posts} />);
    expect(screen.getByTestId("top-posts-instagram")).toBeInTheDocument();
    expect(screen.getByTestId("top-posts-linkedin")).toBeInTheDocument();
    expect(screen.getByText("ig-1")).toBeInTheDocument();
    expect(screen.getByText("1.2K")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
