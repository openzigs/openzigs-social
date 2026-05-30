import { expect, test } from "@playwright/test";

import { InboxPage } from "./pages/inbox.page";

/**
 * Epic #71 — Unified inbox UI (#76) + filters/search (#77).
 *
 * These are structural smoke tests: they verify the inbox shell, the
 * platform/account filter, and the full-text search box render. They degrade
 * gracefully when no API backend is running (the thread list shows its empty
 * state instead of populated rows).
 */
test.describe("Unified inbox (#76, #77)", () => {
  let inbox: InboxPage;

  test.beforeEach(async ({ page }) => {
    inbox = new InboxPage(page);
    await inbox.goto();
  });

  test("renders the inbox shell with filter and search controls", async () => {
    await expect(inbox.heading).toBeVisible();
    await expect(inbox.platformFilter).toBeVisible();
    await expect(inbox.searchBox).toBeVisible();
  });

  test("exposes every supported platform in the filter, including LinkedIn", async () => {
    await expect(
      inbox.platformFilter.getByRole("option", { name: "All platforms" })
    ).toBeAttached();
    await expect(inbox.platformFilter.getByRole("option", { name: "LinkedIn" })).toBeAttached();
  });

  test("renders the conversation list or its empty state", async () => {
    await expect(inbox.listOrEmptyState().first()).toBeVisible();
  });

  test("accepts a full-text search query", async ({ page }) => {
    await inbox.searchBox.fill("hello");
    await expect(inbox.searchBox).toHaveValue("hello");
    // The list (or empty state) remains rendered after filtering.
    await expect(inbox.listOrEmptyState().first()).toBeVisible();
  });
});
