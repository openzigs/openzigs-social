import type { Locator, Page } from "@playwright/test";

import { TOUR_LABELS, type TourSection } from "@/lib/onboarding";

/** The route each contextual tour coach-mark is anchored to (epic #100 AC). */
export const TOUR_ROUTES: Record<TourSection, string> = {
  inbox: "/inbox",
  scheduler: "/calendar",
  "brand-voice": "/settings"
};

/**
 * Page Object for the contextual tour overlays (epic #100 AC). A dismissible
 * coach-mark renders on the inbox, scheduler, and brand-voice routes; dismissal
 * persists in `localStorage`. The overlay is independent of each route's data
 * fetches, so no backend stubbing is required to exercise it.
 */
export class TourPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(section: TourSection): Promise<void> {
    await this.page.goto(TOUR_ROUTES[section]);
  }

  coachMark(section: TourSection): Locator {
    return this.page.getByRole("dialog", { name: `${TOUR_LABELS[section]} tour` });
  }

  dismissButton(section: TourSection): Locator {
    return this.coachMark(section).getByRole("button", { name: "Dismiss tour" });
  }

  async dismiss(section: TourSection): Promise<void> {
    await this.dismissButton(section).click();
  }
}
