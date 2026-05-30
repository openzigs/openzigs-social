import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThreadList } from "./thread-list";
import type { InboxThreadSummary } from "@/lib/inbox";

function thread(over: Partial<InboxThreadSummary> = {}): InboxThreadSummary {
  return {
    id: 1,
    platform: "instagram",
    platformThreadId: "t1",
    contact: { id: 1, displayName: "Ada", platformContactId: "c1" },
    lastMessagePreview: "hello there",
    unreadCount: 0,
    priority: "normal",
    flagged: false,
    dmSupported: true,
    ...over
  };
}

describe("ThreadList", () => {
  it("shows a loading state", () => {
    render(<ThreadList threads={[]} selectedId={null} onSelect={() => {}} loading />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows an error state", () => {
    render(<ThreadList threads={[]} selectedId={null} onSelect={() => {}} error="boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("shows an empty state", () => {
    render(<ThreadList threads={[]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(/no conversations/i);
  });

  it("renders platform badge, name, preview and unread count", () => {
    render(
      <ThreadList threads={[thread({ unreadCount: 3 })]} selectedId={null} onSelect={() => {}} />
    );
    expect(screen.getByLabelText("Conversations")).toBeInTheDocument();
    expect(screen.getByTestId("platform-badge")).toHaveTextContent("Instagram");
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("hello there")).toBeInTheDocument();
    expect(screen.getByLabelText("3 unread")).toHaveTextContent("3");
  });

  it("hides the unread badge when there is nothing unread", () => {
    render(
      <ThreadList threads={[thread({ unreadCount: 0 })]} selectedId={null} onSelect={() => {}} />
    );
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument();
  });

  it("renders a priority tag only for high/urgent threads", () => {
    render(
      <ThreadList
        threads={[
          thread({
            id: 1,
            priority: "urgent",
            contact: { id: 1, displayName: "Aaa", platformContactId: "c1" }
          }),
          thread({
            id: 2,
            priority: "normal",
            contact: { id: 2, displayName: "Bbb", platformContactId: "c2" }
          })
        ]}
        selectedId={null}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    expect(screen.queryByText("Normal")).not.toBeInTheDocument();
  });

  it("marks the selected thread pressed and fires onSelect", () => {
    const onSelect = vi.fn();
    render(<ThreadList threads={[thread({ id: 7 })]} selectedId={7} onSelect={onSelect} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(7);
  });
});
