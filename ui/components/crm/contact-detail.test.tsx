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
      render(<ContactDetailView contact={makeContact()} onDelete={vi.fn()} />);
      expect(screen.getByTestId("delete-contact-btn")).toBeInTheDocument();
    });

    it("opens delete dialog on button click", async () => {
      render(<ContactDetailView contact={makeContact()} onDelete={vi.fn()} />);
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => expect(screen.getByText(/delete jane smith/i)).toBeInTheDocument());
    });

    it("calls onDelete with contact id and cascade=false when confirmed", async () => {
      const onDelete = vi.fn();
      render(<ContactDetailView contact={makeContact()} onDelete={onDelete} />);
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => screen.getByTestId("delete-confirm"));
      fireEvent.click(screen.getByTestId("delete-confirm"));
      expect(onDelete).toHaveBeenCalledWith(42, false);
    });

    it("does not call onDelete when cancelled", async () => {
      const onDelete = vi.fn();
      render(<ContactDetailView contact={makeContact()} onDelete={onDelete} />);
      fireEvent.click(screen.getByTestId("delete-contact-btn"));
      await waitFor(() => screen.getByText(/delete contact/i));
      fireEvent.click(screen.getByText(/^cancel$/i));
      expect(onDelete).not.toHaveBeenCalled();
    });

    it("disables delete button when deleting=true", () => {
      render(<ContactDetailView contact={makeContact()} onDelete={vi.fn()} deleting />);
      expect(screen.getByTestId("delete-contact-btn")).toBeDisabled();
    });
  });
});
