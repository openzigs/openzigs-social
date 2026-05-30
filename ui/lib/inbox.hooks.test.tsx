import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";

import { useInboxThread, useInboxThreads, useSendReply } from "./inbox";

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response)
  );
}

describe("useInboxThreads", () => {
  it("fetches and subscribes/unsubscribes to socket events", async () => {
    stubFetch({ timestamp: "t", threads: [{ id: 1 }] });
    const socket = fakeSocket();
    const { result, unmount } = renderHook(() => useInboxThreads({}, socket), {
      wrapper: wrapper()
    });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 1 }]));
    expect(socket.on).toHaveBeenCalledWith("inbox:message", expect.any(Function));
    act(() => socket.emit("inbox:reply"));
    unmount();
    expect(socket.off).toHaveBeenCalledWith("inbox:reply", expect.any(Function));
  });

  it("works without a socket", async () => {
    stubFetch({ timestamp: "t", threads: [] });
    const { result } = renderHook(() => useInboxThreads({}, null), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useInboxThread", () => {
  it("is disabled when no id is selected", () => {
    const { result } = renderHook(() => useInboxThread(null), { wrapper: wrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches the selected thread", async () => {
    stubFetch({ timestamp: "t", thread: { id: 4 } });
    const { result } = renderHook(() => useInboxThread(4), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toEqual({ id: 4 }));
  });
});

describe("useSendReply", () => {
  it("posts a reply via the mutation", async () => {
    const fetchFn = vi.fn(
      async () =>
        ({ ok: true, status: 200, json: async () => ({ ok: true }) }) as unknown as Response
    );
    vi.stubGlobal("fetch", fetchFn);
    const { result } = renderHook(() => useSendReply(2), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ body: "hi", kind: "dm" });
    });
    expect(fetchFn).toHaveBeenCalled();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
