import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";

import {
  useCreatePost,
  useDeletePost,
  useOutbox,
  useOutboxDlq,
  useReschedulePost,
  useRetryPost
} from "./outbox";

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

function stubFetch(body: unknown) {
  const fn = vi.fn(
    async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useOutbox", () => {
  it("fetches the list and subscribes/unsubscribes to outbox events", async () => {
    stubFetch({ timestamp: "t", posts: [{ id: 1, status: "scheduled" }] });
    const socket = fakeSocket();
    const { result, unmount } = renderHook(() => useOutbox({}, socket), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toEqual([{ id: 1, status: "scheduled" }]));
    expect(socket.on).toHaveBeenCalledWith("outbox:published", expect.any(Function));
    act(() => socket.emit("outbox:failed"));
    unmount();
    expect(socket.off).toHaveBeenCalledWith("outbox:failed", expect.any(Function));
  });

  it("works without a socket", async () => {
    stubFetch({ timestamp: "t", posts: [] });
    const { result } = renderHook(() => useOutbox({}, null), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useOutboxDlq", () => {
  it("fetches the DLQ and refetches on outbox:failed", async () => {
    stubFetch({ timestamp: "t", entries: [{ id: 2 }] });
    const socket = fakeSocket();
    const { result, unmount } = renderHook(() => useOutboxDlq(socket), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toEqual([{ id: 2 }]));
    expect(socket.on).toHaveBeenCalledWith("outbox:failed", expect.any(Function));
    act(() => socket.emit("outbox:failed"));
    unmount();
    expect(socket.off).toHaveBeenCalledWith("outbox:failed", expect.any(Function));
  });
});

describe("outbox mutation hooks", () => {
  it("useCreatePost posts and resolves", async () => {
    const fetchFn = stubFetch({ post: { id: 1, status: "draft" } });
    const { result } = renderHook(() => useCreatePost(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ platform: "twitter", body: "hi" });
    });
    expect(fetchFn).toHaveBeenCalled();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("useReschedulePost posts the new time", async () => {
    const fetchFn = stubFetch({ post: { id: 1, status: "scheduled" } });
    const { result } = renderHook(() => useReschedulePost(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: 1, publishAt: 123 });
    });
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/\/reschedule$/);
  });

  it("useRetryPost requeues a post", async () => {
    const fetchFn = stubFetch({ post: { id: 1, status: "scheduled" } });
    const { result } = renderHook(() => useRetryPost(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: 1 });
    });
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/\/retry$/);
  });

  it("useDeletePost deletes a post", async () => {
    const fetchFn = stubFetch({ ok: true });
    const { result } = renderHook(() => useDeletePost(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync(3);
    });
    expect(fetchFn.mock.calls[0][1]?.method).toBe("DELETE");
  });
});
