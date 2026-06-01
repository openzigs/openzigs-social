import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutoReplyView } from "./auto-reply-view";

const fakeSocket = {
  on: vi.fn(),
  off: vi.fn()
} as unknown as Socket;

vi.mock("@/app/providers", () => ({
  useSocket: () => fakeSocket
}));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response;
}

describe("AutoReplyView", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/config")) {
          return jsonResponse({
            enabled: true,
            thresholds: { confidenceThreshold: 0.85, voiceThreshold: 0.8 }
          });
        }
        if (url.includes("/rulebook")) {
          return jsonResponse({ rulebook: { tone: "warm", bannedWords: [], exemplars: [] } });
        }
        if (url.includes("/audit")) {
          return jsonResponse({ audits: [] });
        }
        return jsonResponse({});
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders the posture, rulebook editor, and decision log", async () => {
    render(<AutoReplyView />, { wrapper: wrapper() });

    expect(screen.getByRole("heading", { name: "AI auto-reply" })).toBeInTheDocument();
    expect(screen.getByText("Hybrid posture")).toBeInTheDocument();
    expect(screen.getByText("Brand voice rulebook")).toBeInTheDocument();
    expect(screen.getByText("Decision log")).toBeInTheDocument();

    // Posture thresholds render once config resolves.
    await waitFor(() => expect(screen.getByText("85%")).toBeInTheDocument());
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Enabled — high-scoring drafts auto-send.")).toBeInTheDocument();

    // Audit log resolves to its empty state.
    await waitFor(() =>
      expect(screen.getByText(/No auto-reply decisions yet/)).toBeInTheDocument()
    );

    // Subscribes to the live socket events for the decision log.
    expect((fakeSocket.on as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });
});
