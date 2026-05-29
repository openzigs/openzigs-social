import { render, screen } from "@testing-library/react";
import { Send } from "lucide-react";
import { describe, expect, it } from "vitest";

import { KpiCard } from "./kpi-card";

describe("KpiCard", () => {
  it("renders title and value", () => {
    render(<KpiCard title="Scheduled posts" value="12" />);
    expect(screen.getByText("Scheduled posts")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders an optional hint", () => {
    render(<KpiCard title="Inbox" value="3" hint="2 urgent" />);
    expect(screen.getByText("2 urgent")).toBeInTheDocument();
  });

  it("renders an optional icon", () => {
    const { container } = render(<KpiCard title="Sent" value="7" icon={Send} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
