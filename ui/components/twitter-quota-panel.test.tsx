import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TwitterQuotaPanel } from "./twitter-quota-panel";
import { fetchTwitterQuota, type TwitterQuotaEvent } from "@/lib/twitter-quota";

vi.mock("@/lib/twitter-quota", async () => {
  const actual = await vi.importActual<typeof import("@/lib/twitter-quota")>("@/lib/twitter-quota");
  return { ...actual, fetchTwitterQuota: vi.fn() };
});

const mockFetch = vi.mocked(fetchTwitterQuota);

function summary(
  over: Partial<{ used: number; cap: number; remaining: number; ratio: number }> = {}
) {
  return {
    month: "2026-05",
    used: 250,
    cap: 1000,
    remaining: 750,
    ratio: 0.25,
    ...over
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("TwitterQuotaPanel", () => {
  it("shows a loading state before data resolves", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<TwitterQuotaPanel />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("renders usage, cap, remaining and tier once loaded", async () => {
    mockFetch.mockResolvedValue({
      timestamp: "2026-05-01T00:00:00.000Z",
      tier: "basic",
      quota: summary()
    });
    render(<TwitterQuotaPanel />);
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("basic")).toBeInTheDocument();
    expect(screen.getByText(/750 remaining this month/)).toBeInTheDocument();
  });

  it("renders an error state when the fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("boom"));
    render(<TwitterQuotaPanel />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("live-updates from a twitter:quota socket event", async () => {
    mockFetch.mockResolvedValue({
      timestamp: "2026-05-01T00:00:00.000Z",
      tier: "basic",
      quota: summary()
    });
    const handlers: Record<string, (event: TwitterQuotaEvent) => void> = {};
    const socket = {
      on: vi.fn((event: string, cb: (event: TwitterQuotaEvent) => void) => {
        handlers[event] = cb;
      }),
      off: vi.fn()
    } as unknown as Parameters<typeof TwitterQuotaPanel>[0]["socket"];

    render(<TwitterQuotaPanel socket={socket} />);
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());

    act(() => {
      handlers["twitter:quota"]({
        level: "exceeded",
        summary: summary({ used: 1000, remaining: 0, ratio: 1 })
      });
    });

    await waitFor(() =>
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
    );
    expect(screen.getByText(/0 remaining this month/)).toBeInTheDocument();
  });
});
