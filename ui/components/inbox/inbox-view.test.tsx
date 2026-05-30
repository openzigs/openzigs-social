import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InboxView } from "./inbox-view";
import * as inboxLib from "@/lib/inbox";

vi.mock("@/app/providers", () => ({ useSocket: () => null }));

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/lib/inbox", async () => {
  const actual = await vi.importActual<typeof import("@/lib/inbox")>("@/lib/inbox");
  return {
    ...actual,
    useInboxThreads: vi.fn(),
    useInboxThread: vi.fn(),
    useSendReply: vi.fn(),
    markThreadRead: vi.fn()
  };
});

const useInboxThreads = vi.mocked(inboxLib.useInboxThreads);
const useInboxThread = vi.mocked(inboxLib.useInboxThread);
const useSendReply = vi.mocked(inboxLib.useSendReply);
const markThreadRead = vi.mocked(inboxLib.markThreadRead);

function summary(over: Partial<inboxLib.InboxThreadSummary> = {}): inboxLib.InboxThreadSummary {
  return {
    id: 1,
    platform: "instagram",
    platformThreadId: "t1",
    contact: { id: 1, displayName: "Ada", platformContactId: "c1" },
    unreadCount: 2,
    priority: "normal",
    flagged: false,
    dmSupported: true,
    lastMessagePreview: "hi",
    ...over
  };
}

function threadsResult(data: inboxLib.InboxThreadSummary[]) {
  return { data, isLoading: false, isError: false, refetch: vi.fn() } as never;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("InboxView", () => {
  it("renders the thread list and filters", () => {
    useInboxThreads.mockReturnValue(threadsResult([summary()]));
    useInboxThread.mockReturnValue({ data: undefined, isLoading: false, isError: false } as never);
    useSendReply.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never);

    render(<InboxView />);
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by platform")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("marks a thread read when selected", async () => {
    markThreadRead.mockResolvedValue(undefined);
    useInboxThreads.mockReturnValue(threadsResult([summary({ id: 7 })]));
    useInboxThread.mockReturnValue({ data: undefined, isLoading: false, isError: false } as never);
    useSendReply.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never);

    render(<InboxView />);
    fireEvent.click(screen.getByRole("button", { name: /Ada/ }));
    await waitFor(() => expect(markThreadRead).toHaveBeenCalledWith(7));
  });

  it("sends a reply and toasts on success", async () => {
    const mutate = vi.fn((_vars, opts: { onSuccess?: () => void }) => opts.onSuccess?.());
    useInboxThreads.mockReturnValue(threadsResult([summary()]));
    useInboxThread.mockReturnValue({
      data: {
        id: 1,
        platform: "instagram",
        platformThreadId: "t1",
        contact: { id: 1, displayName: "Ada", platformContactId: "c1" },
        priority: "normal",
        flagged: false,
        dmSupported: true,
        limits: inboxLib.limitsFor("instagram"),
        dms: [],
        comments: []
      },
      isLoading: false,
      isError: false
    } as never);
    useSendReply.mockReturnValue({ mutate, isPending: false, isError: false } as never);

    render(<InboxView />);
    fireEvent.change(screen.getByLabelText("Reply (dm)"), { target: { value: "yo" } });
    fireEvent.click(screen.getByRole("button", { name: /send reply/i }));
    expect(mutate).toHaveBeenCalled();
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Reply sent" }));
  });
});
