import { expect, test } from "@playwright/test";

import type { ContactDetail, ScoredContact, SuggestedMerge } from "@/lib/crm";

import { ContactsPage, type ContactsStubState } from "./pages/contacts.page";

function baseContact(overrides: Partial<ScoredContact> = {}): ScoredContact {
  return {
    id: 1,
    displayName: "Ada Lovelace",
    email: "ada@studio.example",
    followerCount: 1_200,
    createdAt: "2026-05-25T09:00:00Z",
    updatedAt: "2026-05-30T10:00:00Z",
    linkedAccounts: [
      {
        socialContactId: 1,
        platform: "instagram",
        platformContactId: "ig-ada",
        handle: "ada"
      }
    ],
    engagementCount: 30,
    leadScore: {
      score: 0.75,
      bucket: "top",
      components: { engagement: 1, sentiment: 0.5, follower: 0 }
    },
    ...overrides
  };
}

function detailContact(overrides: Partial<ContactDetail> = {}): ContactDetail {
  return {
    ...baseContact(),
    timeline: [
      {
        id: 100,
        platform: "instagram",
        direction: "inbound",
        body: "Hi, can you share the launch brief?",
        at: "2026-05-29T09:30:00Z"
      }
    ],
    ...overrides
  };
}

function mergeSuggestion(
  survivor: ScoredContact,
  source: ScoredContact,
  email = "ada@studio.example"
): SuggestedMerge {
  return { email, contacts: [survivor, source] };
}

function buildState(overrides: Partial<ContactsStubState> = {}): ContactsStubState {
  const primary = baseContact();
  const secondary = baseContact({
    id: 2,
    displayName: "Ada Lovelace (LinkedIn)",
    email: "ada@studio.example",
    followerCount: 420,
    createdAt: "2026-05-26T09:00:00Z",
    updatedAt: "2026-05-30T10:00:00Z",
    linkedAccounts: [
      {
        socialContactId: 2,
        platform: "linkedin",
        platformContactId: "li-ada",
        handle: "ada-lovelace"
      }
    ],
    engagementCount: 6,
    leadScore: {
      score: 0.54,
      bucket: "high",
      components: { engagement: 0.2, sentiment: 0.6, follower: 0.4 }
    }
  });

  return {
    contacts: [primary, secondary],
    details: [
      detailContact({
        ...primary,
        timeline: [
          {
            id: 101,
            platform: "instagram",
            direction: "inbound",
            body: "First Instagram message",
            at: "2026-05-28T15:00:00Z"
          },
          {
            id: 102,
            platform: "x",
            direction: "outbound",
            body: "Second X reply",
            at: "2026-05-29T09:00:00Z"
          },
          {
            id: 103,
            platform: "linkedin",
            direction: "inbound",
            body: "Final LinkedIn follow-up",
            at: "2026-05-30T11:45:00Z"
          }
        ]
      }),
      detailContact({
        ...secondary,
        timeline: [
          {
            id: 201,
            platform: "linkedin",
            direction: "inbound",
            body: "LinkedIn identity message",
            at: "2026-05-29T08:00:00Z"
          }
        ]
      })
    ],
    suggestions: [mergeSuggestion(primary, secondary)],
    ...overrides
  };
}

test.describe("Contacts view (#90)", () => {
  let contacts: ContactsPage;

  test.beforeEach(({ page }) => {
    contacts = new ContactsPage(page);
  });

  // AC1: The contacts list loads and displays contacts with their lead score + bucket; a contact with 30+ engagements in the last 7 days shows the TOP bucket.
  test("loads the contacts list and shows the TOP bucket for a 30-engagement contact", async () => {
    await contacts.stubScenario(buildState());
    await contacts.goto();

    await expect(contacts.heading).toBeVisible();
    await expect(contacts.contact("Ada Lovelace", "Top")).toBeVisible();
    await expect(contacts.contact("Ada Lovelace", "Top")).toContainText("30 eng / 7d");
    await expect(contacts.contact("Ada Lovelace (LinkedIn)", "High")).toBeVisible();
    await expect(contacts.contact("Ada Lovelace (LinkedIn)", "High")).toContainText("6 eng / 7d");
  });

  // AC2: Clicking a contact opens the detail view with a conversation-history timeline in chronological order (cross-platform).
  test("opens contact detail and renders the cross-platform timeline in chronological order", async () => {
    await contacts.stubScenario(buildState());
    await contacts.goto();

    await test.step("Open the primary contact", async () => {
      await contacts.contact("Ada Lovelace", "Top").click();
      await expect(contacts.detailHeading("Ada Lovelace")).toBeVisible();
    });

    await test.step("Verify the timeline is ordered by time across platforms", async () => {
      await expect(contacts.timelineItems()).toHaveCount(3);
      await expect(contacts.timelineItems().nth(0)).toContainText("First Instagram message");
      await expect(contacts.timelineItems().nth(1)).toContainText("Second X reply");
      await expect(contacts.timelineItems().nth(2)).toContainText("Final LinkedIn follow-up");
    });
  });

  // AC3: The suggested-merges queue presents two identities that share an email address.
  test("shows a suggested merge for two identities that share the same email", async () => {
    await contacts.stubScenario(buildState());
    await contacts.goto();

    await expect(contacts.suggestedMergesHeading).toBeVisible();
    const suggestion = contacts.suggestion("ada@studio.example");
    await expect(suggestion).toBeVisible();
    await expect(suggestion.getByText("Ada Lovelace", { exact: true })).toBeVisible();
    await expect(suggestion.getByText("Ada Lovelace (LinkedIn)", { exact: true })).toBeVisible();
    await expect(contacts.mergeButton()).toBeVisible();
  });

  // AC4: Confirming a manual merge folds the two source contacts into one (the merged-away contact no longer appears as a separate row; history preserved).
  test("merges the suggested pair into one row and preserves the unified history", async () => {
    await contacts.stubScenario(buildState());
    await contacts.goto();

    await test.step("Open the contact that will be merged away", async () => {
      await contacts.contact("Ada Lovelace (LinkedIn)", "High").click();
      await expect(contacts.detailHeading("Ada Lovelace (LinkedIn)")).toBeVisible();
      await expect(contacts.timelineItems()).toHaveCount(1);
      await expect(contacts.timelineItems().nth(0)).toContainText("LinkedIn identity message");
    });

    await test.step("Confirm the suggested merge", async () => {
      await contacts.mergeButton().click();
      await expect(contacts.contact("Ada Lovelace (LinkedIn)", "High")).toHaveCount(0);
      await expect(contacts.contact("Ada Lovelace", "Top")).toBeVisible();
      await expect(contacts.timelineItems()).toHaveCount(4);
      await expect(contacts.timelineItems().nth(0)).toContainText("First Instagram message");
      await expect(contacts.timelineItems().nth(1)).toContainText("LinkedIn identity message");
      await expect(contacts.timelineItems().nth(2)).toContainText("Second X reply");
      await expect(contacts.timelineItems().nth(3)).toContainText("Final LinkedIn follow-up");
    });
  });
});
