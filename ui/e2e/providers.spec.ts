import { expect, test } from "@playwright/test";

import { DashboardPage } from "./pages/dashboard.page";

/**
 * Epic #41 / sub-issue #46 — React Query + Socket.IO providers.
 *
 * AC: the app loads with the React Query and Socket.IO providers mounted
 * without crashing — no uncaught page errors and no Next.js error overlay on
 * initial load. The Socket.IO client targets a dev API that is absent in CI,
 * so benign websocket/network console noise is filtered out.
 */
const BENIGN_CONSOLE = /websocket|socket\.io|localhost:3000|ERR_|Failed to load resource|favicon/i;

test.describe("App providers (#46)", () => {
  test("loads the dashboard without uncaught errors or an error overlay", async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !BENIGN_CONSOLE.test(message.text())) {
        consoleErrors.push(message.text());
      }
    });

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step("the app shell renders, proving providers mounted", async () => {
      await expect(dashboard.heading).toBeVisible();
    });

    await test.step("no Next.js runtime error overlay is shown", async () => {
      await expect(page.locator("nextjs-portal")).toHaveCount(0);
    });

    await test.step("no uncaught errors surfaced", async () => {
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
});
