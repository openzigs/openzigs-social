import type { Locator, Page } from "@playwright/test";

/** Titles of the KPI shell tiles rendered on the dashboard (#45). */
export const KPI_TITLES = ["Scheduled posts", "Unread inbox", "Engagement", "Contacts"] as const;

/** Page Object for the dashboard route (`/`) and its quick-actions dialog. */
export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly kpiSection: Locator;
  readonly quickActionsButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Dashboard", level: 1 });
    this.kpiSection = page.getByRole("region", { name: "Key performance indicators" });
    this.quickActionsButton = page.getByRole("button", { name: "Quick actions" });
  }

  async goto() {
    await this.page.goto("/");
  }

  kpiCard(title: string): Locator {
    return this.kpiSection.getByText(title, { exact: true });
  }

  async openQuickActions() {
    await this.quickActionsButton.click();
  }

  dialog(): Locator {
    return this.page.getByRole("dialog");
  }
}
