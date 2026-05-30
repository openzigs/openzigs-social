import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OutboxView } from "./outbox-view";
import * as outboxLib from "@/lib/outbox";

vi.mock("@/app/providers", () => ({ useSocket: () => null }));

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/lib/outbox", async () => {
  const actual = await vi.importActual<typeof import("@/lib/outbox")>("@/lib/outbox");
  return {
    ...actual,
    useOutbox: vi.fn(),
    useOutboxDlq: vi.fn(),
    useRetryPost: vi.fn(),
    useDeletePost: vi.fn()
  };
});

const useOutbox = vi.mocked(outboxLib.useOutbox);
const useOutboxDlq = vi.mocked(outboxLib.useOutboxDlq);
const useRetryPost = vi.mocked(outboxLib.useRetryPost);
const useDeletePost = vi.mocked(outboxLib.useDeletePost);

function post(over: Partial<outboxLib.OutboxPost> = {}): outboxLib.OutboxPost {
  return {
    id: 1,
    platform: "twitter",
    body: "hello world",
    media: [],
    status: "scheduled",
    publishAt: Date.now() + 60_000,
    attempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over
  };
}

function listResult(data: outboxLib.OutboxPost[]) {
  return { data, isLoading: false, isError: false, error: null } as never;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("OutboxView", () => {
  it("surfaces a failed post with its last error and a retry button", () => {
    const retryMutate = vi.fn();
    useOutbox.mockReturnValue(
      listResult([post({ id: 9, status: "failed", attempts: 5, lastError: "rate limited" })])
    );
    useOutboxDlq.mockReturnValue({ data: [] } as never);
    useRetryPost.mockReturnValue({ mutate: retryMutate, isPending: false } as never);
    useDeletePost.mockReturnValue({ mutate: vi.fn() } as never);

    render(<OutboxView />);

    expect(screen.getByText("Failed (1)")).toBeInTheDocument();
    expect(screen.getByText("rate limited")).toBeInTheDocument();
    expect(screen.getByText(/5 attempt\(s\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retryMutate).toHaveBeenCalledWith({ id: 9 }, expect.any(Object));
  });

  it("renders the dead-letter queue when entries exist", () => {
    useOutbox.mockReturnValue(listResult([]));
    useOutboxDlq.mockReturnValue({
      data: [
        {
          id: 3,
          platform: "tiktok",
          opKind: "publish",
          payload: {},
          lastError: "no token",
          attempts: 5,
          createdAt: Date.now()
        }
      ]
    } as never);
    useRetryPost.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    useDeletePost.mockReturnValue({ mutate: vi.fn() } as never);

    render(<OutboxView />);

    expect(screen.getByText(/Dead-letter queue \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("no token")).toBeInTheDocument();
    expect(screen.getByText(/1m → 5m → 30m → 2h/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no posts", () => {
    useOutbox.mockReturnValue(listResult([]));
    useOutboxDlq.mockReturnValue({ data: [] } as never);
    useRetryPost.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    useDeletePost.mockReturnValue({ mutate: vi.fn() } as never);

    render(<OutboxView />);
    expect(screen.getByText("No posts yet.")).toBeInTheDocument();
  });

  it("deletes a scheduled post via the delete button", () => {
    const delMutate = vi.fn();
    useOutbox.mockReturnValue(listResult([post({ id: 2, status: "scheduled" })]));
    useOutboxDlq.mockReturnValue({ data: [] } as never);
    useRetryPost.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    useDeletePost.mockReturnValue({ mutate: delMutate } as never);

    render(<OutboxView />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(delMutate).toHaveBeenCalledWith(2, expect.any(Object));
  });
});
