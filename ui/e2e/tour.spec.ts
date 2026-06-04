import { expect, test } from "@playwright/test";

import { TOUR_COPY, TOUR_LABELS, TOUR_SECTIONS } from "@/lib/onboarding";

import { OnboardingPage } from "./pages/onboarding.page";
import { TourPage } from "./pages/tour.page";

/**
 * E2E coverage for the contextual tour overlays (epic #100 AC).
 *
 * After the minimal wizard completes and the user reaches the dashboard, a
 * dismissible coach-mark points at the inbox, scheduler, and brand-voice
 * panels. The overlay renders independently of each route's data fetches, so no
 * backend stubbing is needed — a fresh browser context starts with no
 * dismissals, so every coach-mark is visible by default.
 */
test.describe("Contextual tour overlays (#100)", () => {
  let tour: TourPage;

  test.beforeEach(({ page }) => {
    tour = new TourPage(page);
  });

  // AC (#100): a contextual tour overlay points to the inbox, scheduler, and
  // brand-voice panels.
  for (const section of TOUR_SECTIONS) {
    test(`shows the ${section} coach-mark with contextual copy`, async () => {
      await tour.goto(section);

      const mark = tour.coachMark(section);
      await expect(mark).toBeVisible();
      await expect(mark).toContainText(TOUR_LABELS[section]);
      await expect(mark).toContainText(TOUR_COPY[section]);
    });
  }

  // AC (#100): the polish steps are skippable — dismissing a coach-mark hides it.
  test("dismisses a coach-mark on demand", async () => {
    await tour.goto("inbox");
    await expect(tour.coachMark("inbox")).toBeVisible();

    await tour.dismiss("inbox");

    await expect(tour.coachMark("inbox")).toBeHidden();
  });

  // AC (#100): dismissal persists (localStorage) so the tour does not nag.
  test("keeps a dismissed coach-mark hidden across a reload", async ({ page }) => {
    await tour.goto("brand-voice");
    await tour.dismiss("brand-voice");
    await expect(tour.coachMark("brand-voice")).toBeHidden();

    await test.step("reload and confirm it stays dismissed", async () => {
      await page.reload();
      await expect(tour.coachMark("brand-voice")).toBeHidden();
    });
  });

  // AC (#100): dismissing one section does not dismiss the others.
  test("dismisses each section independently", async () => {
    await tour.goto("scheduler");
    await tour.dismiss("scheduler");
    await expect(tour.coachMark("scheduler")).toBeHidden();

    await test.step("the inbox coach-mark is still shown", async () => {
      await tour.goto("inbox");
      await expect(tour.coachMark("inbox")).toBeVisible();
    });
  });

  // AC (#100 AC3): a dismissed coach-mark is re-launchable from the admin panel.
  // After dismissing the inbox coach-mark, clicking "Re-launch tour" on the
  // `/onboarding` panel clears the dismissal and the overlay reappears.
  test("re-launches dismissed coach-marks from the admin panel", async ({ page }) => {
    await tour.goto("inbox");
    await tour.dismiss("inbox");
    await expect(tour.coachMark("inbox")).toBeHidden();

    await test.step("re-launch the tour from the /onboarding admin panel", async () => {
      const onboarding = new OnboardingPage(page);
      await onboarding.goto();
      await onboarding.relaunchButton.click();
    });

    await test.step("the inbox coach-mark is visible again", async () => {
      await tour.goto("inbox");
      await expect(tour.coachMark("inbox")).toBeVisible();
    });
  });
});
