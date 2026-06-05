/**
 * E2E coverage for the YouTube daily quota widget (issue #58).
 *
 * The widget renders on two routes:
 *   • `/settings`         — always present, above the AutoReply view
 *   • `/onboarding`       — inside the Local model panel when
 *                           `widgets.youtubeQuota.available === true`
 *
 * All network calls are intercepted with `page.route()` so the suite runs
 * offline and deterministically in CI.
 */

import { expect, test } from "@playwright/test";

import type { ModelStatus } from "@/lib/onboarding";

import { OnboardingPage } from "./pages/onboarding.page";
import { QuotaPage } from "./pages/quota.page";
import { SettingsPage } from "./pages/settings.page";

// ─────────────────────── helper — model status fixture ────────────────

function modelStatusWithQuota(): ModelStatus {
  return {
    timestamp: new Date().toISOString(),
    ollama: {
      reachable: true,
      baseUrl: "http://127.0.0.1:11434",
      installedVariant: "gemma4:e4b",
      recommendedVariant: "gemma4:e4b",
      variants: ["gemma4:12b", "gemma4:e4b", "gemma4:e2b"],
      models: ["gemma4:e4b"]
    },
    providers: [
      { id: "openai", label: "OpenAI", configured: false },
      { id: "anthropic", label: "Anthropic", configured: false },
      { id: "openai-compatible", label: "OpenAI-compatible", configured: false }
    ],
    selection: null,
    source: "local",
    // youtube quota widget is available → widget renders (not "Coming soon")
    widgets: {
      youtubeQuota: { available: true },
      byokCredit: { available: false }
    }
  };
}

// ══════════════════════════════════════════════════════════════════════
//  Suite A — /settings page
// ══════════════════════════════════════════════════════════════════════

test.describe("YouTube quota widget on /settings (#58)", () => {
  let settings: SettingsPage;
  let quota: QuotaPage;

  test.beforeEach(({ page }) => {
    settings = new SettingsPage(page);
    quota = new QuotaPage(page);
  });

  // AC: Widget is visible on the /settings page.
  test("renders on the /settings page", async () => {
    await quota.stubQuota(QuotaPage.makeQuota(0));
    await settings.stubAutoReply();
    await settings.goto();

    await expect(quota.widget()).toBeVisible();
  });

  // AC: At 0% usage the bar is neutral (no amber/red class) and the label
  // reads "0 / 10,000 units".
  test("shows neutral bar and '0 / 10,000 units' label at 0% usage", async () => {
    await quota.stubQuota(QuotaPage.makeQuota(0));
    await settings.stubAutoReply();
    await settings.goto();

    // Label text
    await expect(quota.widget()).toContainText("0 / 10,000");
    await expect(quota.widget()).toContainText("units");

    // Progressbar ARIA
    const bar = quota.progressbar();
    await expect(bar).toHaveAttribute("aria-valuenow", "0");
    await expect(bar).toHaveAttribute("aria-valuemax", "100");

    // Fill bar should carry neither amber nor destructive class
    const fill = quota.fillBar();
    await expect(fill).not.toHaveClass(/bg-amber-500/);
    await expect(fill).not.toHaveClass(/bg-destructive/);
  });

  // AC: At 65% usage (6 500 units) the bar has the amber style and the label
  // reads "6,500 / 10,000 units".
  test("shows amber bar and '6,500 / 10,000 units' label at 65% usage", async () => {
    await quota.stubQuota(QuotaPage.makeQuota(6_500));
    await settings.stubAutoReply();
    await settings.goto();

    await expect(quota.widget()).toContainText("6,500 / 10,000");
    await expect(quota.widget()).toContainText("units");

    const bar = quota.progressbar();
    await expect(bar).toHaveAttribute("aria-valuenow", "65");

    await expect(quota.fillBar()).toHaveClass(/bg-amber-500/);
  });

  // AC: At 85% usage (8 500 units) the bar has the red style and the label
  // reads "8,500 / 10,000 units".
  test("shows red bar and '8,500 / 10,000 units' label at 85% usage", async () => {
    await quota.stubQuota(QuotaPage.makeQuota(8_500));
    await settings.stubAutoReply();
    await settings.goto();

    await expect(quota.widget()).toContainText("8,500 / 10,000");
    await expect(quota.widget()).toContainText("units");

    const bar = quota.progressbar();
    await expect(bar).toHaveAttribute("aria-valuenow", "85");

    await expect(quota.fillBar()).toHaveClass(/bg-destructive/);
  });

  // AC: The progressbar element exposes correct ARIA attributes.
  test("progressbar has correct aria-valuenow and aria-valuemax attributes", async () => {
    const used = 4_200;
    const expectedPct = Math.round((used / 10_000) * 100); // 42
    await quota.stubQuota(QuotaPage.makeQuota(used));
    await settings.stubAutoReply();
    await settings.goto();

    const bar = quota.progressbar();
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("aria-valuemin", "0");
    await expect(bar).toHaveAttribute("aria-valuemax", "100");
    await expect(bar).toHaveAttribute("aria-valuenow", String(expectedPct));
    await expect(bar).toHaveAccessibleName("YouTube daily quota used");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Suite B — /onboarding model panel
// ══════════════════════════════════════════════════════════════════════

test.describe("YouTube quota widget in the onboarding model panel (#58)", () => {
  let onboarding: OnboardingPage;
  let quota: QuotaPage;

  test.beforeEach(({ page }) => {
    onboarding = new OnboardingPage(page);
    quota = new QuotaPage(page);
  });

  // AC: Widget renders inside the Local model panel when the server signals
  // `widgets.youtubeQuota.available === true`.
  test("renders the live quota widget in the /onboarding model panel", async () => {
    await onboarding.stubModelStatus(modelStatusWithQuota());
    await quota.stubQuota(QuotaPage.makeQuota(3_000));
    await onboarding.goto();

    // The model tab is the default first tab — no click needed.
    // The widget-youtube slot must contain the actual quota widget, not the
    // "Coming soon" placeholder.
    const widgetSlot = onboarding.youtubeWidget();
    await expect(widgetSlot).toBeVisible();
    await expect(widgetSlot).toContainText("3,000 / 10,000");
    await expect(widgetSlot).not.toContainText("Coming soon");

    // The accessible progressbar inside the slot must be present.
    await expect(quota.progressbar()).toBeVisible();
    await expect(quota.progressbar()).toHaveAttribute("aria-valuenow", "30");
  });
});
