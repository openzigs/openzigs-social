import type { Locator, Page, Route } from "@playwright/test";

import type { YouTubeQuotaInfo } from "@/lib/youtube";

/**
 * Helper Page Object for the `YouTubeQuotaWidget` component (#58).
 *
 * The widget appears on multiple routes (`/settings`, `/onboarding` model panel),
 * so this class encapsulates all quota-widget locators and the `/api/youtube/quota`
 * route stub in one place.  Compose it alongside a route-specific page object in
 * each spec file.
 */
export class QuotaPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** The outermost widget container (data-testid="yt-quota-widget"). */
  widget(): Locator {
    return this.page.getByTestId("yt-quota-widget");
  }

  /**
   * The accessible progress bar (`role="progressbar"`,
   * `aria-label="YouTube daily quota used"`).
   */
  progressbar(): Locator {
    return this.page.getByRole("progressbar", { name: "YouTube daily quota used" });
  }

  /**
   * The visual fill bar inside the progressbar — located as the first direct
   * child `<div>` of the progressbar element.  Used to assert colour classes.
   */
  fillBar(): Locator {
    return this.progressbar().locator("div").first();
  }

  // ───────────────────────────── stubs ────────────────────────────────

  /** Intercepts GET /api/youtube/quota and fulfils it with `info`. */
  async stubQuota(info: YouTubeQuotaInfo): Promise<void> {
    await this.page.route(/\/api\/youtube\/quota(?:\?.*)?$/, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(info)
      })
    );
  }

  // ─────────────────────────── factories ──────────────────────────────

  /**
   * Build a `YouTubeQuotaInfo` fixture for the given `used` unit count
   * against a 10,000-unit daily limit.
   */
  static makeQuota(used: number, limit = 10_000): YouTubeQuotaInfo {
    return {
      used,
      limit,
      pct: Math.round((used / limit) * 100),
      day_utc: "2026-06-04"
    };
  }
}
