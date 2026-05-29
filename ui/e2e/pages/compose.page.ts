import type { Locator, Page, Route } from "@playwright/test";

/** A connection summary as returned by `GET /api/connections`. */
export interface StubConnection {
  platform: "instagram" | "facebook" | "threads";
  label: string;
  connected: boolean;
  needsReconsent: boolean;
  expiresAt?: number;
}

/** Page Object for the composer route (`/compose`, epic #53). */
export class ComposePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly publishFieldset: Locator;
  readonly body: Locator;
  readonly status: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Compose", level: 1 });
    this.publishFieldset = page.getByRole("group", { name: "Publish to" });
    this.body = page.getByLabel("Post");
    this.status = page.getByText(/select at least one connected account|publishing to/i);
  }

  /** Stub `GET /api/connections` before navigating — no real backend. */
  async stubConnections(connections: StubConnection[]): Promise<void> {
    await this.page.route("**/api/connections", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ timestamp: new Date().toISOString(), connections })
      })
    );
  }

  async goto(): Promise<void> {
    await this.page.goto("/compose");
  }

  target(label: string): Locator {
    return this.page.getByLabel(new RegExp(label));
  }
}
