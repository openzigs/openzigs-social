import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThreadDetail, LINKEDIN_DM_NOTICE } from "./thread-detail";
import { limitsFor, type InboxThreadDetail } from "@/lib/inbox";

function detail(over: Partial<InboxThreadDetail> = {}): InboxThreadDetail {
  const platform = over.platform ?? "instagram";
  return {
    id: 1,
    platform,
    platformThreadId: "t1",
    contact: { id: 1, displayName: "Ada", platformContactId: "c1" },
    priority: "normal",
    flagged: false,
    dmSupported: limitsFor(platform).dmSupported,
    limits: limitsFor(platform),
    dms: [],
    comments: [],
    ...over
  };
}

describe("ThreadDetail", () => {
  it("shows a placeholder prompt when no thread is selected", () => {
    render(<ThreadDetail onReply={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(/select a conversation/i);
  });

  it("shows a loading state", () => {
    render(<ThreadDetail loading onReply={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows an error state", () => {
    render(<ThreadDetail error="boom" onReply={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("renders DM and Comments tabs for a DM-capable platform", () => {
    render(
      <ThreadDetail
        thread={detail({
          platform: "instagram",
          dms: [
            {
              id: 1,
              platform: "instagram",
              platformMessageId: "m1",
              direction: "inbound",
              body: "hi dm",
              kind: "dm",
              createdAt: "2026-05-01T00:00:00Z"
            }
          ]
        })}
        onReply={() => {}}
      />
    );
    expect(screen.getByRole("tab", { name: "Direct Messages" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Comments" })).toBeInTheDocument();
    expect(screen.queryByTestId("dm-unsupported-notice")).not.toBeInTheDocument();
    expect(screen.getByText("hi dm")).toBeInTheDocument();
  });

  it("hides the DM section and shows the LinkedIn notice for a comments-only platform", () => {
    render(
      <ThreadDetail
        thread={detail({
          platform: "linkedin",
          comments: [
            {
              id: 2,
              platform: "linkedin",
              platformMessageId: "m2",
              direction: "inbound",
              body: "nice post",
              kind: "comment",
              createdAt: "2026-05-01T00:00:00Z"
            }
          ]
        })}
        onReply={() => {}}
      />
    );
    expect(screen.queryByRole("tab", { name: "Direct Messages" })).not.toBeInTheDocument();
    expect(screen.getByTestId("dm-unsupported-notice")).toHaveTextContent(LINKEDIN_DM_NOTICE);
    expect(screen.getByText("nice post")).toBeInTheDocument();
  });

  it("sends a comment reply on a comments-only platform", () => {
    const onReply = vi.fn();
    render(<ThreadDetail thread={detail({ platform: "linkedin" })} onReply={onReply} />);
    fireEvent.change(screen.getByLabelText("Reply (comment)"), { target: { value: "thanks" } });
    fireEvent.click(screen.getByRole("button", { name: /send reply/i }));
    expect(onReply).toHaveBeenCalledWith("thanks", "comment");
  });

  it("sends a DM reply from the DM tab on a DM-capable platform", () => {
    const onReply = vi.fn();
    render(<ThreadDetail thread={detail({ platform: "instagram" })} onReply={onReply} />);
    fireEvent.change(screen.getByLabelText("Reply (dm)"), { target: { value: "yo" } });
    fireEvent.click(screen.getByRole("button", { name: /send reply/i }));
    expect(onReply).toHaveBeenCalledWith("yo", "dm");
  });
});
