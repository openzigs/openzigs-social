import { expect, test, type Route } from "@playwright/test";

import type { OutboxDlqEntry, OutboxPost } from "@/lib/outbox";

import { OutboxPage } from "./pages/outbox.page";

/**
 * E2E coverage for the outbox queue / dead-letter view and the composer's
 * X-280 submit guard (epic #84, sub-issues #87 and #89).
 *
 * All backend reads are intercepted with `page.route` so the suite is
 * deterministic and never touches a real API, scheduler, or social platform.
 */

function makePost(overrides: Partial<OutboxPost> = {}): OutboxPost {
  return {
    id: 1,
    platform: "twitter",
    body: "hello world",
    media: [],
    status: "scheduled",
    publishAt: Date.now() + 3_600_000,
    attempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  };
}

function makeDlqEntry(overrides: Partial<OutboxDlqEntry> = {}): OutboxDlqEntry {
  return {
    id: 9,
    platform: "twitter",
    opKind: "publish",
    payload: {},
    lastError: "rate limited by X",
    attempts: 5,
    createdAt: Date.now(),
    ...overrides
  };
}

test.describe("Outbox view — failures & dead-letter (#89)", () => {
  let outbox: OutboxPage;

  test.beforeEach(({ page }) => {
    outbox = new OutboxPage(page);
  });

  test("surfaces a failed post with its error, attempt count, and retry button", async () => {
    const failed = makePost({
      id: 2,
      status: "failed",
      lastError: "token expired",
      attempts: 3
    });
    await outbox.stub([failed]);
    await outbox.goto();

    await expect(outbox.heading).toBeVisible();
    await expect(outbox.failedHeading()).toBeVisible();
    await expect(outbox.page.getByText("token expired")).toBeVisible();
    await expect(outbox.page.getByText(/3 attempt\(s\)/i)).toBeVisible();
    await expect(outbox.retryButton()).toBeEnabled();
  });

  test("retrying a failed post requeues it (failed → scheduled)", async () => {
    const failed = makePost({ id: 3, status: "failed", lastError: "boom", attempts: 2 });
    await outbox.stub([failed]);
    await outbox.stubRetry(failed);
    await outbox.goto();

    await expect(outbox.retryButton()).toBeVisible();
    await outbox.retryButton().click();
    await expect(outbox.page.getByText(/post requeued/i).first()).toBeVisible();
  });

  test("dead-letter queue shows the 1m → 5m → 30m → 2h retry schedule", async () => {
    await outbox.stub([], [makeDlqEntry()]);
    await outbox.goto();

    await expect(outbox.dlqHeading()).toBeVisible();
    await expect(outbox.page.getByText(/1m → 5m → 30m → 2h/)).toBeVisible();
    await expect(outbox.page.getByText("rate limited by X")).toBeVisible();
  });
});

test.describe("Composer X-280 submit guard (#87)", () => {
  test("blocks scheduling when an X post exceeds 280 characters", async ({ page }) => {
    await page.route("**/api/connections", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          connections: [{ platform: "twitter", label: "X", connected: true, needsReconsent: false }]
        })
      })
    );
    await page.goto("/compose");

    await expect(page.getByRole("heading", { name: "Compose", level: 1 })).toBeVisible();
    await page.getByLabel(/^X$/).check();

    const body = page.getByLabel("Post");
    await body.fill("a".repeat(281));

    // The counter goes negative and the schedule button stays disabled.
    await expect(page.getByText(/-1 characters left/)).toBeVisible();
    await page.getByLabel("Schedule for").fill("2099-01-01T10:00");
    await expect(page.getByRole("button", { name: "Schedule" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();

    // Trimming back under the limit re-enables submit.
    await body.fill("a".repeat(280));
    await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });
});
