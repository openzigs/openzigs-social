import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as youtubeLib from "@/lib/youtube";
import { YouTubeQuotaWidget } from "./quota-widget";

vi.mock("@/lib/youtube", () => ({
  getYouTubeQuota: vi.fn()
}));

const getYouTubeQuota = vi.mocked(youtubeLib.getYouTubeQuota);

function makeQuota(
  used: number,
  pct: number = Math.min(100, Math.round((used / 10_000) * 100))
): youtubeLib.YouTubeQuotaInfo {
  return { day_utc: "2025-06-04", used, limit: 10_000, pct };
}

describe("YouTubeQuotaWidget", () => {
  it("shows loading state initially", () => {
    getYouTubeQuota.mockReturnValue(new Promise(() => {})); // never resolves
    render(<YouTubeQuotaWidget />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders quota info after loading", async () => {
    getYouTubeQuota.mockResolvedValue(makeQuota(500, 5));
    render(<YouTubeQuotaWidget />);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.getByText(/youtube quota today/i)).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();
    expect(screen.getByText(/10,000/)).toBeInTheDocument();
  });

  it("renders accessible progressbar", async () => {
    getYouTubeQuota.mockResolvedValue(makeQuota(3000, 30));
    render(<YouTubeQuotaWidget />);
    await waitFor(() => screen.getByRole("progressbar"));
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "30");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("shows error state when fetch fails", async () => {
    getYouTubeQuota.mockRejectedValue(new Error("network error"));
    render(<YouTubeQuotaWidget />);
    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByRole("alert")).toHaveTextContent(/network error/i);
  });

  it("applies amber bar class at 60% usage", async () => {
    getYouTubeQuota.mockResolvedValue(makeQuota(6000, 60));
    render(<YouTubeQuotaWidget />);
    await waitFor(() => screen.getByRole("progressbar"));
    const fill = screen.getByRole("progressbar").querySelector("[class*='bg-amber']");
    expect(fill).not.toBeNull();
  });

  it("applies red (destructive) bar class at 80% usage", async () => {
    getYouTubeQuota.mockResolvedValue(makeQuota(8000, 80));
    render(<YouTubeQuotaWidget />);
    await waitFor(() => screen.getByRole("progressbar"));
    const fill = screen.getByRole("progressbar").querySelector("[class*='destructive']");
    expect(fill).not.toBeNull();
  });

  it("uses primary bar class below 60% usage", async () => {
    getYouTubeQuota.mockResolvedValue(makeQuota(1000, 10));
    render(<YouTubeQuotaWidget />);
    await waitFor(() => screen.getByRole("progressbar"));
    const fill = screen.getByRole("progressbar").querySelector("[class*='bg-primary']");
    expect(fill).not.toBeNull();
  });

  it("shows percentage and date in muted text", async () => {
    getYouTubeQuota.mockResolvedValue(makeQuota(2500, 25));
    render(<YouTubeQuotaWidget />);
    await waitFor(() => screen.getByRole("progressbar"));
    expect(screen.getByText(/25%/)).toBeInTheDocument();
    expect(screen.getByText(/2025-06-04/)).toBeInTheDocument();
  });
});
