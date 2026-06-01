import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalyticsView } from "./analytics-view";

const fakeSocket = { on: vi.fn(), off: vi.fn() } as unknown as Socket;

vi.mock("@/app/providers", () => ({
  useSocket: () => fakeSocket
}));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function json(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

const SUMMARY = {
  window: 30,
  totals: {
    engagement: 1200,
    posts: 8,
    impressions: 3_400_000,
    followers: 500,
    avgEngagementPerPost: 150
  },
  perPlatform: [
    { platform: "instagram", engagement: 1000, posts: 5, impressions: 2_000_000, followers: 300 },
    { platform: "linkedin", engagement: 200, posts: 3, impressions: 1_400_000, followers: 200 }
  ]
};

function stubFetch(overrides: Partial<Record<string, unknown>> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/summary")) return json(overrides.summary ?? SUMMARY);
      if (url.includes("/engagement"))
        return json({
          series: [{ platform: "instagram", capturedFor: "2026-06-15", engagement: 9 }]
        });
      if (url.includes("/heatmap")) return json({ buckets: [], matrix: [] });
      if (url.includes("/top-posts")) return json({ posts: [] });
      return json({});
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AnalyticsView", () => {
  beforeEach(() => {
    stubFetch();
  });

  it("renders the header, KPI row, and live panels", async () => {
    render(<AnalyticsView />, { wrapper: wrapper() });

    expect(screen.getByRole("heading", { name: "Analytics" })).toBeInTheDocument();
    expect(screen.getByText("Engagement")).toBeInTheDocument();
    expect(screen.getByText("Posts")).toBeInTheDocument();
    expect(screen.getByText("Impressions")).toBeInTheDocument();
    expect(screen.getByText("Followers")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("1.2K")).toBeInTheDocument());
    expect(screen.getByText("3.4M")).toBeInTheDocument();
    expect(screen.getByText("Avg 150 per post")).toBeInTheDocument();
  });

  it("derives platform pills from the unfiltered summary", async () => {
    render(<AnalyticsView />, { wrapper: wrapper() });
    expect(screen.getByRole("button", { name: "All platforms" })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("group", { name: "Filter by platform" }).querySelectorAll("button").length
      ).toBeGreaterThan(1)
    );
  });

  it("switches the active time window", async () => {
    render(<AnalyticsView />, { wrapper: wrapper() });
    const sevenDays = screen.getByRole("button", { name: "7 days" });
    expect(sevenDays).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(sevenDays);
    expect(sevenDays).toHaveAttribute("aria-pressed", "true");
  });

  it("subscribes to the analytics socket channel", () => {
    render(<AnalyticsView />, { wrapper: wrapper() });
    expect((fakeSocket.on as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it("surfaces a summary error", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/summary")) return json({ error: "kaboom" }, false, 500);
        return json({ series: [], buckets: [], matrix: [], posts: [] });
      })
    );
    render(<AnalyticsView />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("kaboom"));
  });
});
