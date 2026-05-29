import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublishTargets } from "./publish-targets";
import * as connectionsApi from "@/lib/connections";
import type { ConnectionSummary } from "@/lib/connections";

afterEach(() => {
  vi.restoreAllMocks();
});

const CONNECTIONS: ConnectionSummary[] = [
  { platform: "instagram", label: "Instagram", connected: true, needsReconsent: false },
  { platform: "facebook", label: "Facebook Pages", connected: false, needsReconsent: false },
  { platform: "threads", label: "Threads", connected: false, needsReconsent: true }
];

describe("PublishTargets", () => {
  it("renders a checkbox per connection once loaded", async () => {
    vi.spyOn(connectionsApi, "fetchConnections").mockResolvedValue(CONNECTIONS);
    render(<PublishTargets />);
    expect(await screen.findByLabelText(/Instagram/)).toBeEnabled();
    expect(screen.getByLabelText(/Facebook Pages/)).toBeDisabled();
    expect(screen.getByText(/not connected/i)).toBeInTheDocument();
    expect(screen.getByText(/reconnect required/i)).toBeInTheDocument();
  });

  it("reports selection changes for connected accounts", async () => {
    vi.spyOn(connectionsApi, "fetchConnections").mockResolvedValue(CONNECTIONS);
    const onSelectionChange = vi.fn();
    render(<PublishTargets onSelectionChange={onSelectionChange} />);
    const ig = await screen.findByLabelText(/Instagram/);
    fireEvent.click(ig);
    expect(onSelectionChange).toHaveBeenLastCalledWith(["instagram"]);
    fireEvent.click(ig);
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it("shows an error when the fetch fails", async () => {
    vi.spyOn(connectionsApi, "fetchConnections").mockRejectedValue(new Error("boom"));
    render(<PublishTargets />);
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });

  it("shows a loading state initially", () => {
    vi.spyOn(connectionsApi, "fetchConnections").mockReturnValue(new Promise(() => undefined));
    render(<PublishTargets />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("does not let a disconnected account be selected", async () => {
    vi.spyOn(connectionsApi, "fetchConnections").mockResolvedValue(CONNECTIONS);
    const onSelectionChange = vi.fn();
    render(<PublishTargets onSelectionChange={onSelectionChange} />);
    const fb = await screen.findByLabelText(/Facebook Pages/);
    fireEvent.click(fb);
    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});
