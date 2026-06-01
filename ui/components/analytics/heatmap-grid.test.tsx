import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HeatmapGrid } from "./heatmap-grid";
import type { HeatmapResponse } from "@/lib/analytics";

function denseMatrix(set: Record<string, number> = {}): number[][] {
  const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const [key, value] of Object.entries(set)) {
    const [d, h] = key.split(":").map(Number);
    matrix[d!]![h!] = value;
  }
  return matrix;
}

describe("HeatmapGrid", () => {
  it("shows a loading hint", () => {
    render(<HeatmapGrid data={undefined} loading />);
    expect(screen.getByText("Loading heatmap…")).toBeInTheDocument();
  });

  it("shows the empty state when every slot is zero", () => {
    const data: HeatmapResponse = { buckets: [], matrix: denseMatrix() };
    render(<HeatmapGrid data={data} />);
    expect(screen.getByRole("status")).toHaveTextContent("No posts published yet.");
  });

  it("paints the grid and labels the busiest slot", () => {
    const data: HeatmapResponse = { buckets: [], matrix: denseMatrix({ "1:12": 4 }) };
    render(<HeatmapGrid data={data} />);
    expect(screen.getByTestId("heatmap-grid")).toBeInTheDocument();
    expect(screen.getByLabelText("Mon 12:00, 4 posts")).toBeInTheDocument();
  });
});
