import type { Locator, Page } from "@playwright/test";

/** Page Object for the unified inbox route (`/inbox`) — epic #71 (#76/#77). */
export class InboxPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly platformFilter: Locator;
  readonly searchBox: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Inbox", level: 1 });
    this.platformFilter = page.getByLabel("Filter by platform");
    this.searchBox = page.getByLabel("Search messages");
  }

  async goto() {
    await this.page.goto("/inbox");
  }

  conversationList(): Locator {
    return this.page.getByLabel("Conversations");
  }

  /** Either the populated list or the empty-state status when no backend. */
  listOrEmptyState(): Locator {
    return this.page.getByLabel("Conversations").or(this.page.getByRole("status"));
  }
}
