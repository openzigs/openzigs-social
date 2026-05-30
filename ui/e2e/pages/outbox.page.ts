import type { Locator, Page, Route } from "@playwright/test";

import type { OutboxPost, OutboxDlqEntry } from "@/lib/outbox";

/** Page Object for the outbox queue + dead-letter route (`/outbox`, epic #89). */
export class OutboxPage {
  readonly page: Page;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Outbox", level: 1 });
  }

  /** Stub `GET /api/outbox` and `GET /api/outbox/dlq` before navigating. */
  async stub(posts: OutboxPost[], dlq: OutboxDlqEntry[] = []): Promise<void> {
    // DLQ must be registered first — it is a more specific path than the list.
    await this.page.route("**/api/outbox/dlq", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ timestamp: new Date().toISOString(), entries: dlq })
      })
    );
    await this.page.route(/\/api\/outbox(\?.*)?$/, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ timestamp: new Date().toISOString(), posts })
      })
    );
  }

  /** Capture the next `POST /api/outbox/:id/retry` and resolve it successfully. */
  async stubRetry(post: OutboxPost): Promise<void> {
    await this.page.route("**/api/outbox/*/retry", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ post: { ...post, status: "scheduled", lastError: undefined } })
      })
    );
  }

  async goto(): Promise<void> {
    await this.page.goto("/outbox");
  }

  failedHeading(): Locator {
    return this.page.getByRole("heading", { name: /^failed/i });
  }

  dlqHeading(): Locator {
    return this.page.getByRole("heading", { name: /dead-letter queue/i });
  }

  retryButton(): Locator {
    return this.page.getByRole("button", { name: /retry/i });
  }
}
