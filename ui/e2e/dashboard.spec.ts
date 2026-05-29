import { expect, test } from "@playwright/test";

import { DashboardPage, KPI_TITLES } from "./pages/dashboard.page";

/**
 * Epic #41 / sub-issues #45 (dashboard KPI shell) and #42 (shadcn primitives).
 *
 * AC (#45): the KPI card shell renders.
 * AC (#42/#45): the quick-actions Radix Dialog opens (shadcn primitive smoke).
 */
test.describe("Dashboard (#45, #42)", () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
  });

  // AC: KPI card shell renders with every tile.
  test("renders the dashboard heading and KPI card shell", async () => {
    await expect(dashboard.heading).toBeVisible();
    await expect(dashboard.kpiSection).toBeVisible();

    for (const title of KPI_TITLES) {
      await expect(dashboard.kpiCard(title)).toBeVisible();
    }
  });

  // AC (#42): the shadcn/Radix Dialog primitive opens end-to-end.
  test("opens and closes the quick-actions dialog", async ({ page }) => {
    await test.step("open the dialog", async () => {
      await dashboard.openQuickActions();
    });

    const dialog = dashboard.dialog();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Quick actions" })).toBeVisible();

    await test.step("close the dialog", async () => {
      await dialog.getByRole("button", { name: "Close" }).click();
      await expect(dialog).toBeHidden();
    });
  });

  // AC (#42): the dialog is also dismissible via the Escape key.
  test("closes the quick-actions dialog with the Escape key", async ({ page }) => {
    await dashboard.openQuickActions();
    await expect(dashboard.dialog()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dashboard.dialog()).toBeHidden();
  });
});
