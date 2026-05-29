import { expect, test } from "@playwright/test";

import { AppShell } from "./pages/app-shell.page";

const html = (shell: AppShell) => shell.page.locator("html");

/**
 * Epic #41 / sub-issue #44 — dark mode toggle.
 *
 * AC: toggle cycles system/light/dark; selection persists across reload
 * (localStorage); the `html` element reflects the choice via the `dark` class;
 * no flash of the wrong theme (FOUC) after reload.
 */
test.describe("Dark mode (#44)", () => {
  let shell: AppShell;

  test.beforeEach(async ({ page }) => {
    // Pin the OS preference so "system" resolves deterministically.
    await page.emulateMedia({ colorScheme: "light" });
    shell = new AppShell(page);
    await shell.goto("/");
  });

  // AC: selecting Dark applies the dark class and persists to localStorage.
  test("applies and persists the dark theme", async ({ page }) => {
    await shell.selectTheme("Dark");

    await expect(html(shell)).toHaveClass(/dark/);
    expect(await shell.storedTheme()).toBe("dark");

    await test.step("persists across reload", async () => {
      await page.reload();
      await expect(html(shell)).toHaveClass(/dark/);
      expect(await shell.storedTheme()).toBe("dark");
    });
  });

  // AC: toggle cycles through system / light / dark.
  test("cycles between light, dark and system", async () => {
    await shell.selectTheme("Dark");
    await expect(html(shell)).toHaveClass(/dark/);

    await shell.selectTheme("Light");
    await expect(html(shell)).not.toHaveClass(/dark/);
    expect(await shell.storedTheme()).toBe("light");

    await shell.selectTheme("System");
    // System resolves to the emulated light preference.
    await expect(html(shell)).not.toHaveClass(/dark/);
    expect(await shell.storedTheme()).toBe("system");
  });

  // AC: system preference is honoured on first visit.
  test("honours the system color-scheme preference on first visit", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.context().clearCookies();
    await page.addInitScript(() => window.localStorage.clear());
    await shell.goto("/");

    await expect(html(shell)).toHaveClass(/dark/);
    // No explicit preference stored yet — it defaults to "system".
    expect(await shell.storedTheme()).toBeNull();
  });

  // AC: the persisted theme is applied before first paint (no FOUC).
  test("applies the stored dark theme before first paint on reload", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("openzigs-theme", "dark"));
    await shell.goto("/");

    // The inline init script runs before React hydrates, so the dark class is
    // present immediately rather than flashing the light theme.
    await expect(html(shell)).toHaveClass(/dark/);
  });
});
