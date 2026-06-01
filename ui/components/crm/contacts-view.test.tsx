import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContactsView } from "./contacts-view";
import * as crmLib from "@/lib/crm";

vi.mock("@/app/providers", () => ({ useSocket: () => null }));

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/lib/crm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/crm")>("@/lib/crm");
  return {
    ...actual,
    useContacts: vi.fn(),
    useContact: vi.fn(),
    useSuggestedMerges: vi.fn(),
    useMergeContacts: vi.fn()
  };
});

const useContacts = vi.mocked(crmLib.useContacts);
const useContact = vi.mocked(crmLib.useContact);
const useSuggestedMerges = vi.mocked(crmLib.useSuggestedMerges);
const useMergeContacts = vi.mocked(crmLib.useMergeContacts);

function scored(over: Partial<crmLib.ScoredContact> = {}): crmLib.ScoredContact {
  return {
    id: 1,
    displayName: "Ada Lovelace",
    email: "ada@studio.com",
    followerCount: 1200,
    createdAt: "2026-01-01 00:00:00",
    updatedAt: "2026-01-02 00:00:00",
    linkedAccounts: [
      { socialContactId: 1, platform: "instagram", platformContactId: "ig1", handle: "ada" }
    ],
    engagementCount: 30,
    leadScore: {
      score: 0.75,
      bucket: "top",
      components: { engagement: 1, sentiment: 0.5, follower: 0 }
    },
    ...over
  };
}

function listResult(data: crmLib.ScoredContact[]) {
  return { data, isLoading: false, isError: false } as never;
}

function detailResult(data?: crmLib.ContactDetail) {
  return { data, isLoading: false, isError: false } as never;
}

function suggestionsResult(data: crmLib.SuggestedMerge[]) {
  return { data, isLoading: false, isError: false } as never;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ContactsView", () => {
  it("renders scored contacts with their lead bucket (AC2)", () => {
    useContacts.mockReturnValue(listResult([scored()]));
    useContact.mockReturnValue(detailResult(undefined));
    useSuggestedMerges.mockReturnValue(suggestionsResult([]));
    useMergeContacts.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);

    render(<ContactsView />);
    expect(screen.getByRole("heading", { name: "Contacts" })).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getAllByTestId("lead-bucket")[0]).toHaveTextContent("Top");
  });

  it("shows the conversation timeline when a contact is selected (AC3 history)", () => {
    useContacts.mockReturnValue(listResult([scored()]));
    useContact.mockReturnValue(
      detailResult({
        ...scored(),
        timeline: [
          {
            id: 1,
            platform: "instagram",
            direction: "inbound",
            body: "first hi",
            at: "2026-01-01 00:00:00"
          },
          {
            id: 2,
            platform: "linkedin",
            direction: "outbound",
            body: "second reply",
            at: "2026-01-02 00:00:00"
          }
        ]
      })
    );
    useSuggestedMerges.mockReturnValue(suggestionsResult([]));
    useMergeContacts.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);

    render(<ContactsView />);
    fireEvent.click(screen.getByRole("button", { name: /Ada Lovelace/ }));
    expect(screen.getByTestId("timeline")).toBeInTheDocument();
    expect(screen.getByText("first hi")).toBeInTheDocument();
    expect(screen.getByText("second reply")).toBeInTheDocument();
  });

  it("renders a suggested merge and triggers a merge on confirm (AC1)", async () => {
    const survivor = scored({ id: 1, displayName: "Ada (IG)" });
    const source = scored({
      id: 2,
      displayName: "Ada (LI)",
      linkedAccounts: [
        { socialContactId: 2, platform: "linkedin", platformContactId: "li1", handle: "ada-pro" }
      ]
    });
    const mutate = vi.fn((_vars, opts: { onSuccess?: () => void }) => opts.onSuccess?.());

    useContacts.mockReturnValue(listResult([survivor, source]));
    useContact.mockReturnValue(detailResult(undefined));
    useSuggestedMerges.mockReturnValue(
      suggestionsResult([{ email: "ada@studio.com", contacts: [survivor, source] }])
    );
    useMergeContacts.mockReturnValue({ mutate, isPending: false } as never);

    render(<ContactsView />);
    expect(screen.getByTestId("suggested-merges")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(mutate).toHaveBeenCalledWith(
      { survivorId: 1, sourceId: 2 },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Contacts merged" }));
  });

  it("shows the empty suggested-merge state when none exist", () => {
    useContacts.mockReturnValue(listResult([scored()]));
    useContact.mockReturnValue(detailResult(undefined));
    useSuggestedMerges.mockReturnValue(suggestionsResult([]));
    useMergeContacts.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);

    render(<ContactsView />);
    expect(screen.getByTestId("no-suggestions")).toBeInTheDocument();
  });
});
