import { expect, test } from "@playwright/test";

import { AppShell, NAV_LINKS } from "./pages/app-shell.page";

/**
 * Epic #41 / sub-issue #43 — top-nav with route links.
 *
 * AC: all six route links present; clicking a link navigates and sets the
 * active state via `aria-current="page"`.
 */
test.describe("Top navigation (#43)", () => {
  let shell: AppShell;

  test.beforeEach(async ({ page }) => {
    shell = new AppShell(page);
    await shell.goto("/");
  });

  // AC: "Build top-nav with route links (Inbox, Compose, Calendar, Analytics, Contacts, Settings)"
  test("renders all six primary route links", async () => {
    await expect(shell.primaryNav).toBeVisible();
    for (const { name } of NAV_LINKS) {
      await expect(shell.navLink(name)).toBeVisible();
    }
    await expect(shell.primaryNav.getByRole("link")).toHaveCount(NAV_LINKS.length);
  });

  // AC: clicking a link navigates to its route and marks it active (aria-current).
  for (const { name, path } of NAV_LINKS) {
    test(`navigates to ${name} and marks it active`, async ({ page }) => {
      await test.step(`click the ${name} link`, async () => {
        await shell.navLink(name).click();
      });

      await test.step("verify navigation and active state", async () => {
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(shell.navLink(name)).toHaveAttribute("aria-current", "page");
      });
    });
  }

  // AC: only the current route is marked active.
  test("marks exactly one link active at a time", async ({ page }) => {
    await shell.navLink("Compose").click();
    await expect(page).toHaveURL(/\/compose$/);

    await expect(shell.navLink("Compose")).toHaveAttribute("aria-current", "page");
    await expect(shell.navLink("Inbox")).not.toHaveAttribute("aria-current", "page");
  });
});
