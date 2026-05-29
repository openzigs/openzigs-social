import type { Locator, Page } from "@playwright/test";

export type ThemeOption = "Light" | "Dark" | "System";

/** The six primary destinations rendered in the top-nav (#43). */
export const NAV_LINKS = [
  { name: "Inbox", path: "/inbox" },
  { name: "Compose", path: "/compose" },
  { name: "Calendar", path: "/calendar" },
  { name: "Analytics", path: "/analytics" },
  { name: "Contacts", path: "/contacts" },
  { name: "Settings", path: "/settings" }
] as const;

/**
 * Page Object for the persistent application shell: top-nav route links and
 * the theme toggle. Shared across every route.
 */
export class AppShell {
  readonly page: Page;
  readonly primaryNav: Locator;
  readonly themeToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.primaryNav = page.getByRole("navigation", { name: "Primary" });
    this.themeToggle = page.getByRole("button", { name: "Toggle theme" });
  }

  async goto(path = "/") {
    await this.page.goto(path);
  }

  navLink(name: string): Locator {
    return this.primaryNav.getByRole("link", { name, exact: true });
  }

  async openThemeMenu() {
    await this.themeToggle.click();
  }

  /** Open the theme menu and select an option. */
  async selectTheme(option: ThemeOption) {
    await this.openThemeMenu();
    await this.page.getByRole("menuitem", { name: option }).click();
  }

  /** Read the persisted theme preference from localStorage. */
  storedTheme(): Promise<string | null> {
    return this.page.evaluate(() => window.localStorage.getItem("openzigs-theme"));
  }
}
