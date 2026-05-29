import { expect, test } from "@playwright/test";

import { DashboardPage } from "./pages/dashboard.page";

/**
 * Epic #41 — UI shell smoke test.
 *
 * AC: the home/dashboard route renders with Tailwind v4 styles applied.
 */
test.describe("UI shell smoke (#41)", () => {
  test("renders the dashboard with Tailwind styles applied", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(page).toHaveTitle(/openzigs-social/);
    await expect(dashboard.heading).toBeVisible();

    await test.step("Tailwind utility classes resolve to real CSS", async () => {
      // The KPI region uses Tailwind's `grid` utility; if the stylesheet loaded,
      // its computed display is `grid` rather than the default block.
      await expect(dashboard.kpiSection).toHaveCSS("display", "grid");
    });
  });
});
