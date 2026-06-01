import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EngagementChart } from "./engagement-chart";
import type { EngagementPoint } from "@/lib/analytics";

describe("EngagementChart", () => {
  it("shows a loading hint", () => {
    render(<EngagementChart points={[]} loading />);
    expect(screen.getByText("Loading engagement…")).toBeInTheDocument();
  });

  it("shows the empty state when there are no points", () => {
    render(<EngagementChart points={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("No engagement recorded yet.");
  });

  it("renders the chart once there is data", () => {
    const points: EngagementPoint[] = [
      { platform: "instagram", capturedFor: "2026-06-14", engagement: 5 },
      { platform: "instagram", capturedFor: "2026-06-15", engagement: 8 }
    ];
    render(<EngagementChart points={points} />);
    expect(screen.getByTestId("engagement-chart")).toBeInTheDocument();
  });
});
