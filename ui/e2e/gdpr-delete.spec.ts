/**
 * E2E coverage for GDPR right-to-delete (issue #138).
 *
 * All network calls are intercepted with `page.route()` so the suite runs
 * offline and deterministically in CI.
 */

import { expect, test } from "@playwright/test";

import type { ContactDetail, ScoredContact } from "@/lib/crm";

import { ContactsPage, type ContactsStubState } from "./pages/contacts.page";

// ─────────────────────────────── fixtures ──────────────────────────────

function baseContact(overrides: Partial<ScoredContact> = {}): ScoredContact {
  return {
    id: 1,
    displayName: "Grace Hopper",
    email: "grace@cobol.example",
    followerCount: 5_000,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    linkedAccounts: [
      {
        socialContactId: 1,
        platform: "linkedin",
        platformContactId: "li-grace",
        handle: "gracehopper"
      }
    ],
    engagementCount: 45,
    leadScore: {
      score: 0.82,
      bucket: "top",
      components: { engagement: 1, sentiment: 0.8, follower: 0.3 }
    },
    ...overrides
  };
}

function detailContact(overrides: Partial<ContactDetail> = {}): ContactDetail {
  return {
    ...baseContact(),
    timeline: [
      {
        id: 10,
        platform: "linkedin",
        direction: "inbound",
        body: "Hello, would love to connect.",
        at: "2026-05-30T10:00:00Z"
      }
    ],
    ...overrides
  };
}

function buildState(overrides: Partial<ContactsStubState> = {}): ContactsStubState {
  return {
    contacts: [baseContact()],
    details: [detailContact()],
    suggestions: [],
    ...overrides
  };
}

// ─────────────────────────────── tests ─────────────────────────────────

test.describe("GDPR right-to-delete (#138)", () => {
  let contacts: ContactsPage;

  test.beforeEach(({ page }) => {
    contacts = new ContactsPage(page);
  });

  // AC: The contact detail page renders a "Delete" button that is accessible
  // and does not perform a destructive action without confirmation.
  test("contact detail renders an accessible Delete button for the selected contact", async () => {
    await contacts.stubScenario(buildState());
    await contacts.goto();

    await contacts.contact("Grace Hopper", "Top").click();
    await expect(contacts.detailHeading("Grace Hopper")).toBeVisible();

    const deleteBtn = contacts.deleteButton();
    await expect(deleteBtn).toBeVisible();
    await expect(deleteBtn).toBeEnabled();
    // Verify it does NOT fire immediately — the dialog should not be open yet
    await expect(contacts.deleteDialog()).not.toBeVisible();
  });

  // AC: Clicking "Delete" opens a confirmation dialog that includes the
  // contact name and a permanent-deletion warning.
  test("clicking Delete opens the confirmation dialog with the contact name and warning", async () => {
    await contacts.stubScenario(buildState());
    await contacts.goto();

    await contacts.contact("Grace Hopper", "Top").click();
    await expect(contacts.detailHeading("Grace Hopper")).toBeVisible();

    await contacts.deleteButton().click();

    await expect(contacts.deleteDialog()).toBeVisible();
    await expect(contacts.deleteDialogTitle("Grace Hopper")).toBeVisible();
    // AC: dialog must convey that the action is permanent / cannot be undone
    await expect(contacts.page.getByText(/cannot be undone/i)).toBeVisible();
    // Both action buttons must be accessible
    await expect(contacts.cancelDeleteButton()).toBeVisible();
    await expect(contacts.confirmDeleteButton()).toBeVisible();
  });

  // AC: Cancelling the dialog closes it and does NOT call the delete API.
  test("cancelling the dialog closes it without triggering a delete", async () => {
    await contacts.stubScenario(buildState());
    await contacts.goto();

    await contacts.contact("Grace Hopper", "Top").click();
    await expect(contacts.detailHeading("Grace Hopper")).toBeVisible();

    await contacts.deleteButton().click();
    await expect(contacts.deleteDialog()).toBeVisible();

    await contacts.cancelDeleteButton().click();

    // Dialog must close
    await expect(contacts.deleteDialog()).not.toBeVisible();
    // Contact detail must remain intact (no delete occurred)
    await expect(contacts.detailHeading("Grace Hopper")).toBeVisible();
    // No success or error toast should have appeared
    await expect(contacts.page.getByText("Contact deleted")).not.toBeVisible();
    await expect(contacts.page.getByText("Delete failed")).not.toBeVisible();
  });

  // AC: Confirming the delete calls DELETE /api/contacts/:id?cascade=false,
  // shows a receipt toast, and deselects the contact (UI returns to placeholder).
  test("confirming delete calls DELETE cascade=false, shows receipt toast, and deselects the contact", async ({
    page
  }) => {
    await contacts.stubScenario(buildState());
    // Must be registered AFTER stubScenario — routes are LIFO in Playwright.
    await contacts.stubDeleteContact(1, {
      receipt: {
        deletedAt: "2026-06-04T12:00:00Z",
        contactId: "1",
        rowsDeleted: {
          contacts: 1,
          social_messages: 5,
          auto_reply_audit: 2,
          platform_insights_raw: 3
        }
      }
    });
    await contacts.goto();

    await contacts.contact("Grace Hopper", "Top").click();
    await expect(contacts.detailHeading("Grace Hopper")).toBeVisible();

    // Capture the DELETE request to assert the correct query parameter.
    const deleteRequest = page.waitForRequest(
      (req) => req.method() === "DELETE" && /\/api\/contacts\/1/.test(req.url())
    );

    await contacts.deleteButton().click();
    await contacts.confirmDeleteButton().click();

    const request = await deleteRequest;
    expect(request.url()).toContain("cascade=false");

    // Receipt toast must appear
    await expect(page.getByText("Contact deleted")).toBeVisible();
    // Verify the description text in the toast (filter to avoid the ARIA live region duplicate)
    const toastDesc = page.getByText(/Removed 1 contact, 5 message/i).first();
    await expect(toastDesc).toBeVisible();

    // Detail view should revert to the placeholder (contact deselected)
    await expect(page.getByText("Select a contact to see their profile")).toBeVisible();
  });

  // AC: If the API returns an error, the dialog stays open and shows an inline
  // error message. The user can retry or cancel from within the open dialog.
  test("API error keeps dialog open with an inline error message (no toast)", async ({ page }) => {
    await contacts.stubScenario(buildState());
    await contacts.stubDeleteContact(1, {
      statusCode: 404,
      error: "contact not found"
    });
    await contacts.goto();

    await contacts.contact("Grace Hopper", "Top").click();
    await expect(contacts.detailHeading("Grace Hopper")).toBeVisible();

    await contacts.deleteButton().click();
    await expect(contacts.deleteDialog()).toBeVisible();
    await contacts.confirmDeleteButton().click();

    // Dialog must remain open
    await expect(contacts.deleteDialog()).toBeVisible();
    // Inline error must be visible inside the dialog
    await expect(contacts.deleteErrorMessage()).toBeVisible();
    await expect(contacts.deleteErrorMessage()).toContainText(/contact not found/i);
    // No success toast
    await expect(page.getByText("Contact deleted")).not.toBeVisible();
  });

  // AC: Dialog stays open on error; user can cancel to dismiss.
  test("user can cancel the dialog after an error", async () => {
    await contacts.stubScenario(buildState());
    await contacts.stubDeleteContact(1, { statusCode: 500, error: "server error" });
    await contacts.goto();

    await contacts.contact("Grace Hopper", "Top").click();
    await expect(contacts.detailHeading("Grace Hopper")).toBeVisible();

    await contacts.deleteButton().click();
    await contacts.confirmDeleteButton().click();

    await expect(contacts.deleteErrorMessage()).toBeVisible();
    await contacts.cancelDeleteButton().click();
    await expect(contacts.deleteDialog()).not.toBeVisible();
  });

  // AC: If contact has no merge history (mergeCount=0), only the single
  // "Delete contact" button appears — no cascade radio group.
  test("contact without merge history shows no cascade radio buttons", async () => {
    const state = buildState({
      details: [detailContact({ mergeCount: 0 })]
    });
    await contacts.stubScenario(state);
    await contacts.goto();

    await contacts.contact("Grace Hopper", "Top").click();
    await expect(contacts.detailHeading("Grace Hopper")).toBeVisible();
    await contacts.deleteButton().click();

    await expect(contacts.deleteDialog()).toBeVisible();
    await expect(contacts.deleteScopesSingle()).not.toBeVisible();
    await expect(contacts.deleteScopesCascade()).not.toBeVisible();
  });

  // AC: If contact HAS merge history (mergeCount > 0), both cascade radio
  // buttons appear inside the dialog.
  test("contact WITH merge history shows both cascade radio buttons", async () => {
    const state = buildState({
      details: [detailContact({ mergeCount: 2 })]
    });
    await contacts.stubScenario(state);
    await contacts.goto();

    await contacts.contact("Grace Hopper", "Top").click();
    await expect(contacts.detailHeading("Grace Hopper")).toBeVisible();
    await contacts.deleteButton().click();

    await expect(contacts.deleteDialog()).toBeVisible();
    await expect(contacts.deleteScopesSingle()).toBeVisible();
    await expect(contacts.deleteScopesCascade()).toBeVisible();
    await expect(contacts.page.getByText(/what to delete/i)).toBeVisible();
  });

  // AC: Selecting cascade=true and confirming calls DELETE …?cascade=true.
  test("selecting cascade=true calls DELETE with cascade=true", async ({ page }) => {
    const state = buildState({
      details: [detailContact({ mergeCount: 1 })]
    });
    await contacts.stubScenario(state);
    await contacts.stubDeleteContact(1, {
      receipt: {
        deletedAt: "2026-06-04T12:00:00Z",
        contactId: "1",
        rowsDeleted: {
          contacts: 2,
          social_messages: 8,
          auto_reply_audit: 3,
          platform_insights_raw: 4,
          merged_contacts: 1
        }
      }
    });
    await contacts.goto();

    await contacts.contact("Grace Hopper", "Top").click();
    await expect(contacts.detailHeading("Grace Hopper")).toBeVisible();

    const deleteRequest = page.waitForRequest(
      (req) => req.method() === "DELETE" && /\/api\/contacts\/1/.test(req.url())
    );

    await contacts.deleteButton().click();
    await expect(contacts.deleteScopesCascade()).toBeVisible();
    await contacts.deleteScopesCascade().click();
    await contacts.confirmDeleteButton().click();

    const request = await deleteRequest;
    expect(request.url()).toContain("cascade=true");

    await expect(page.getByText("Contact deleted")).toBeVisible();
  });
});
