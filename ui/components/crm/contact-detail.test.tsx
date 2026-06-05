import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ContactDetailView } from "./contact-detail";
import type { ContactDetail } from "@/lib/crm";

function makeContact(over: Partial<ContactDetail> = {}): ContactDetail {
  return {
    id: 42,
    displayName: "Jane Smith",
    email: "jane@test.com",
    followerCount: 500,
    createdAt: "2026-01-01 00:00:00",
    updatedAt: "2026-01-02 00:00:00",
    linkedAccounts: [
      { socialContactId: 1, platform: "twitter", platformContactId: "tw1", handle: "jane" }
    ],
    engagementCount: 10,
    leadScore: {
      score: 0.6,
      bucket: "high",
      components: { engagement: 0.8, sentiment: 0.5, follower: 0.3 }
    },
    timeline: [],
    mergeCount: 0,
    ...over
  };
}

describe("ContactDetailView", () => {
  it("shows placeholder when no contact selected", () => {
    render(<ContactDetailView />);
    expect(screen.getByText(/select a contact/i)).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<ContactDetailView loading />);
    expect(screen.getByText(/loading contact/i)).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<ContactDetailView error="something went wrong" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i);
  });

  it("renders contact detail with name and lead bucket", () => {
    render(<ContactDetailView contact={makeContact()} />);
    expect(screen.getByTestId("contact-detail")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(screen.getByTestId("lead-bucket")).toBeInTheDocument();
  });

  it("renders linked accounts", () => {
    render(<ContactDetailView contact={makeContact()} />);
    expect(screen.getAllByTestId("linked-account")).toHaveLength(1);
  });

  it("shows empty timeline message when no messages", () => {
    render(<ContactDetailView contact={makeContact({ timeline: [] })} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it("renders timeline messages", () => {
    const contact = makeContact({
      timeline: [
        {
          id: 1,
          platform: "twitter",
          direction: "inbound",
          body: "hello there",
          at: "2026-01-01T10:00:00Z"
        }
      ]
    });
    render(<ContactDetailView contact={contact} />);
    expect(screen.getByTestId("timeline")).toBeInTheDocument();
    expect(screen.getByText("hello there")).toBeInTheDocument();
  });

  describe("delete button (GDPR #138)", () => {
    it("does not render delete button when onDelete is not provided", () => {
      render(<ContactDetailView contact={makeContact()} />);
      expect(screen.queryByTestId("delete-contact-btn")).not.toBeInTheDocument();
    });

    it("renders delete button when onDelete is provided", () => {
      render(
        <ContactDetailView
          contact={makeContact()}
          onDelete={vi.fn().mockResolvedValue(undefined)}
        />
      );
      expect(screen.getByTestId("delete-contact-btn")).toBeInTheDocument();
    });

    it("opens delete dialog on button click", async () => {
      render(
        <ContactDetailView
          contact={makeContact()}
          onDelete={vi.fn().mockResolvedValue(undefined)}
        />
      );
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => expect(screen.getByText(/delete jane smith/i)).toBeInTheDocument());
    });

    it("calls onDelete with contact id and cascade=false when confirmed (no merge history)", async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined);
      render(<ContactDetailView contact={makeContact({ mergeCount: 0 })} onDelete={onDelete} />);
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => screen.getByTestId("delete-confirm"));
      fireEvent.click(screen.getByTestId("delete-confirm"));
      await waitFor(() => expect(onDelete).toHaveBeenCalledWith(42, false));
    });

    it("does not call onDelete when cancelled", async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined);
      render(<ContactDetailView contact={makeContact()} onDelete={onDelete} />);
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => screen.getByText(/delete contact/i));
      fireEvent.click(screen.getByText(/^cancel$/i));
      expect(onDelete).not.toHaveBeenCalled();
    });

    it("disables delete button when deleting=true", () => {
      render(
        <ContactDetailView
          contact={makeContact()}
          onDelete={vi.fn().mockResolvedValue(undefined)}
          deleting
        />
      );
      expect(screen.getByTestId("delete-contact-btn")).toBeDisabled();
    });

    it("does NOT show cascade radio group when mergeCount is 0", async () => {
      render(
        <ContactDetailView
          contact={makeContact({ mergeCount: 0 })}
          onDelete={vi.fn().mockResolvedValue(undefined)}
        />
      );
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => screen.getByTestId("delete-confirm"));
      expect(screen.queryByTestId("delete-scope-single")).not.toBeInTheDocument();
      expect(screen.queryByTestId("delete-scope-cascade")).not.toBeInTheDocument();
    });

    it("does NOT show cascade radio group when mergeCount is undefined", async () => {
      render(
        <ContactDetailView
          contact={makeContact({ mergeCount: undefined })}
          onDelete={vi.fn().mockResolvedValue(undefined)}
        />
      );
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => screen.getByTestId("delete-confirm"));
      expect(screen.queryByTestId("delete-scope-cascade")).not.toBeInTheDocument();
    });

    it("shows cascade radio group when mergeCount > 0", async () => {
      render(
        <ContactDetailView
          contact={makeContact({ mergeCount: 2 })}
          onDelete={vi.fn().mockResolvedValue(undefined)}
        />
      );
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => screen.getByTestId("delete-scope-single"));
      expect(screen.getByTestId("delete-scope-single")).toBeInTheDocument();
      expect(screen.getByTestId("delete-scope-cascade")).toBeInTheDocument();
      expect(screen.getByText(/what to delete/i)).toBeInTheDocument();
    });

    it("calls onDelete with cascade=false when 'Delete this contact only' is selected", async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined);
      render(<ContactDetailView contact={makeContact({ mergeCount: 1 })} onDelete={onDelete} />);
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => screen.getByTestId("delete-scope-single"));
      fireEvent.click(screen.getByTestId("delete-scope-single"));
      fireEvent.click(screen.getByTestId("delete-confirm"));
      await waitFor(() => expect(onDelete).toHaveBeenCalledWith(42, false));
    });

    it("calls onDelete with cascade=true when 'Delete and all merged' is selected", async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined);
      render(<ContactDetailView contact={makeContact({ mergeCount: 1 })} onDelete={onDelete} />);
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => screen.getByTestId("delete-scope-cascade"));
      fireEvent.click(screen.getByTestId("delete-scope-cascade"));
      fireEvent.click(screen.getByTestId("delete-confirm"));
      await waitFor(() => expect(onDelete).toHaveBeenCalledWith(42, true));
    });

    it("keeps dialog open and shows error message when onDelete rejects", async () => {
      const onDelete = vi.fn().mockRejectedValue(new Error("contact not found"));
      render(<ContactDetailView contact={makeContact()} onDelete={onDelete} />);
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => screen.getByTestId("delete-confirm"));
      fireEvent.click(screen.getByTestId("delete-confirm"));
      await waitFor(() => expect(screen.getByTestId("delete-error")).toBeInTheDocument());
      expect(screen.getByTestId("delete-error")).toHaveTextContent(/contact not found/i);
      // Dialog must still be visible
      expect(screen.getByTestId("delete-confirm")).toBeInTheDocument();
    });

    it("clears error and closes dialog on successful retry after a previous error", async () => {
      const onDelete = vi
        .fn()
        .mockRejectedValueOnce(new Error("temporary error"))
        .mockResolvedValueOnce(undefined);
      render(<ContactDetailView contact={makeContact()} onDelete={onDelete} />);
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => screen.getByTestId("delete-confirm"));
      // First attempt — error
      fireEvent.click(screen.getByTestId("delete-confirm"));
      await waitFor(() => screen.getByTestId("delete-error"));
      // Second attempt — success
      fireEvent.click(screen.getByTestId("delete-confirm"));
      await waitFor(() => expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument());
    });

    it("closes dialog on cancel even when an error is showing", async () => {
      const onDelete = vi.fn().mockRejectedValue(new Error("fail"));
      render(<ContactDetailView contact={makeContact()} onDelete={onDelete} />);
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => screen.getByTestId("delete-confirm"));
      fireEvent.click(screen.getByTestId("delete-confirm"));
      await waitFor(() => screen.getByTestId("delete-error"));
      fireEvent.click(screen.getByText(/^cancel$/i));
      await waitFor(() => expect(screen.queryByTestId("delete-confirm")).not.toBeInTheDocument());
    });
  });
});
