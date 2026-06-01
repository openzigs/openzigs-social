import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";

import {
  fetchRulebook,
  resolveAudit,
  saveRulebook,
  scoreDraft,
  useAuditLog,
  useAutoReplyConfig,
  useResolveAudit,
  useRulebook,
  useSaveRulebook,
  useScoreDraft
} from "./auto-reply";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function fakeSocket() {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => handlers.set(event, cb)),
    off: vi.fn((event: string) => handlers.delete(event)),
    emit(event: string) {
      handlers.get(event)?.();
    }
  } as unknown as Socket & { emit: (event: string) => void };
}

function stubFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({ ok, status, json: async () => body }) as unknown as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function initOf(fetchFn: ReturnType<typeof stubFetch>, call = 0): RequestInit {
  const args = fetchFn.mock.calls[call] as unknown as [string, RequestInit?];
  return args[1] ?? {};
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetch helpers", () => {
  it("fetchRulebook unwraps the envelope", async () => {
    stubFetch({ rulebook: { tone: "warm", bannedWords: [], exemplars: [] } });
    await expect(fetchRulebook()).resolves.toEqual({
      tone: "warm",
      bannedWords: [],
      exemplars: []
    });
  });

  it("saveRulebook PUTs and returns the saved rulebook", async () => {
    const fetchFn = stubFetch({ rulebook: { tone: "x", bannedWords: ["a"], exemplars: [] } });
    const result = await saveRulebook({ tone: "x", bannedWords: ["a"], exemplars: [] });
    expect(result.bannedWords).toEqual(["a"]);
    expect(initOf(fetchFn)).toMatchObject({ method: "PUT" });
  });

  it("scoreDraft POSTs the draft", async () => {
    const fetchFn = stubFetch({
      voice: { score: 0.5, toneMatch: 0.5, bannedWordPenalty: 0, bannedHits: [] }
    });
    const score = await scoreDraft("hi");
    expect(score.score).toBe(0.5);
    expect(initOf(fetchFn)).toMatchObject({ method: "POST" });
  });

  it("resolveAudit omits editedText when undefined", async () => {
    const fetchFn = stubFetch({ audit: { id: 1, outcome: "sent" } });
    await resolveAudit(1, true);
    expect(JSON.parse(initOf(fetchFn).body as string)).toEqual({
      approve: true
    });
  });

  it("resolveAudit includes editedText when provided", async () => {
    const fetchFn = stubFetch({ audit: { id: 1, outcome: "sent" } });
    await resolveAudit(1, true, "edited");
    expect(JSON.parse(initOf(fetchFn).body as string)).toEqual({
      approve: true,
      editedText: "edited"
    });
  });

  it("surfaces the server error message", async () => {
    stubFetch({ error: "boom" }, false, 422);
    await expect(scoreDraft("x")).rejects.toThrow("boom");
  });
});

describe("useRulebook / useSaveRulebook", () => {
  it("loads the rulebook", async () => {
    stubFetch({ rulebook: { tone: "warm", bannedWords: [], exemplars: [] } });
    const { result } = renderHook(() => useRulebook(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.tone).toBe("warm"));
  });

  it("saves and primes the cache", async () => {
    stubFetch({ rulebook: { tone: "new", bannedWords: [], exemplars: [] } });
    const { result } = renderHook(() => useSaveRulebook(), { wrapper: wrapper() });
    act(() => {
      result.current.mutate({ tone: "new", bannedWords: [], exemplars: [] });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useScoreDraft / useAutoReplyConfig", () => {
  it("scores via mutation", async () => {
    stubFetch({ voice: { score: 1, toneMatch: 1, bannedWordPenalty: 0, bannedHits: [] } });
    const { result } = renderHook(() => useScoreDraft(), { wrapper: wrapper() });
    act(() => {
      result.current.mutate("perfect");
    });
    await waitFor(() => expect(result.current.data?.score).toBe(1));
  });

  it("loads the posture config", async () => {
    stubFetch({ enabled: true, thresholds: { confidenceThreshold: 0.85, voiceThreshold: 0.8 } });
    const { result } = renderHook(() => useAutoReplyConfig(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.enabled).toBe(true));
  });
});

describe("useAuditLog", () => {
  it("fetches and subscribes/unsubscribes to autoReply events", async () => {
    stubFetch({ audits: [{ id: 1, threadId: "t" }] });
    const socket = fakeSocket();
    const { result, unmount } = renderHook(() => useAuditLog({}, socket), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(socket.on).toHaveBeenCalledWith("autoReply:sent", expect.any(Function));
    act(() => socket.emit("autoReply:queued"));
    unmount();
    expect(socket.off).toHaveBeenCalledWith("autoReply:rejected", expect.any(Function));
  });

  it("works without a socket", async () => {
    stubFetch({ audits: [] });
    const { result } = renderHook(() => useAuditLog({}, null), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useResolveAudit", () => {
  it("resolves and invalidates the audit query", async () => {
    stubFetch({ audit: { id: 1, outcome: "rejected" } });
    const { result } = renderHook(() => useResolveAudit(), { wrapper: wrapper() });
    act(() => {
      result.current.mutate({ id: 1, approve: false });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
