import { expect, test } from "@playwright/test";

import { PROVIDER_LABELS, SetupPage, STEP_LABELS } from "./pages/setup.page";

/**
 * E2E coverage for the minimal setup wizard (epic #129, sub-issues #101/#103/#104).
 *
 * The provider `/models` and Telegram `getMe`/`sendMessage` calls hit external
 * services, so the backend endpoints (`/api/setup/validate-key`,
 * `/api/setup/telegram/verify`, `/api/setup/status`) are intercepted with
 * `page.route` and answered deterministically — no real keys/tokens are used and
 * no real network calls are made.
 */

const FAKE_OPENAI_KEY = "sk-e2e-fake-1234567890";
const FAKE_BOT_TOKEN = "123456:E2E-fake-bot-token";
const FAKE_CHAT_ID = "987654321";

test.describe("Setup wizard shell (#101)", () => {
  let setup: SetupPage;

  test.beforeEach(async ({ page }) => {
    setup = new SetupPage(page);
    // Defensive: any stray status probe resolves locally, never over the network.
    await setup.stubStatus({ complete: false, hasProvider: false, hasTelegram: false });
    await setup.goto();
  });

  // AC (#129): step 1 (shell) renders with a 3-step indicator.
  test("renders step 1 with a 3-step indicator", async () => {
    await expect(setup.pageHeading).toBeVisible();
    await expect(setup.stepTitle("Welcome to openzigs-social")).toBeVisible();

    await test.step("step indicator shows three labelled steps on step 1", async () => {
      await expect(setup.stepIndicator).toHaveAccessibleName(/step 1 of 3/i);
      for (const label of STEP_LABELS) {
        await expect(setup.stepIndicator.getByText(label, { exact: true })).toBeVisible();
      }
    });
  });

  // AC (#129): advancing steps updates the indicator.
  test("advancing a step updates the step indicator", async () => {
    await expect(setup.stepIndicator).toHaveAccessibleName(/step 1 of 3/i);

    await setup.advanceFromWelcome();

    await expect(setup.stepIndicator).toHaveAccessibleName(/step 2 of 3/i);
    await expect(setup.stepTitle("Connect your AI provider")).toBeVisible();
  });

  // AC (#129): persisted progress across refreshes (the key persistence criterion).
  test("persists progress across a page reload", async ({ page }) => {
    await setup.advanceFromWelcome();
    await expect(setup.stepIndicator).toHaveAccessibleName(/step 2 of 3/i);

    await test.step("reload mid-wizard and stay on the same step", async () => {
      await page.reload();
      await expect(setup.stepIndicator).toHaveAccessibleName(/step 2 of 3/i);
      await expect(setup.stepTitle("Connect your AI provider")).toBeVisible();
    });
  });
});

test.describe("BYOK provider step (#103)", () => {
  let setup: SetupPage;

  test.beforeEach(async ({ page }) => {
    setup = new SetupPage(page);
    await setup.stubStatus({ complete: false, hasProvider: false, hasTelegram: false });
    await setup.goto();
    await setup.advanceFromWelcome();
    await expect(setup.stepTitle("Connect your AI provider")).toBeVisible();
  });

  // AC (#129/#103): the user can pick each BYOK provider option.
  test("supports selecting each provider option", async () => {
    for (const label of PROVIDER_LABELS) {
      await setup.selectProvider(label);
      await expect(setup.providerRadio(label)).toHaveAttribute("aria-checked", "true");
    }

    await test.step("OpenAI-compatible reveals a base URL field", async () => {
      await setup.selectProvider("OpenAI-compatible");
      await expect(setup.baseUrlInput).toBeVisible();
    });
  });

  // AC (#129/#103): a valid key validates and the UI advances.
  test("advances to the Telegram step on a valid key", async () => {
    await setup.stubValidateKey({ valid: true, provider: "openai", stored: true });

    await setup.selectProvider("OpenAI");
    await setup.apiKeyInput.fill(FAKE_OPENAI_KEY);
    await setup.validateButton.click();

    await expect(setup.successStatus).toContainText(/validated and saved/i);
    await expect(setup.nextButton).toBeEnabled();

    await setup.nextButton.click();
    await expect(setup.stepIndicator).toHaveAccessibleName(/step 3 of 3/i);
    await expect(setup.stepTitle("Connect your Telegram bot")).toBeVisible();
  });

  // AC (#103): an invalid key shows an error and does NOT advance.
  test("shows an error and does not advance on an invalid key", async () => {
    await setup.stubValidateKey({ valid: false, provider: "anthropic", reason: "Invalid API key" });

    await setup.selectProvider("Anthropic");
    await setup.apiKeyInput.fill("sk-wrong");
    await setup.validateButton.click();

    await expect(setup.errorAlert).toContainText("Invalid API key");
    await expect(setup.nextButton).toBeDisabled();
    await expect(setup.stepIndicator).toHaveAccessibleName(/step 2 of 3/i);
  });

  // Security: the API key must never be rendered back into the DOM as plain text.
  test("never renders the API key back into the DOM after submit", async ({ page }) => {
    await setup.stubValidateKey({ valid: true, provider: "openai", stored: true });

    await setup.selectProvider("OpenAI");
    await setup.apiKeyInput.fill(FAKE_OPENAI_KEY);
    await setup.validateButton.click();
    await expect(setup.successStatus).toContainText(/validated and saved/i);

    await expect(page.getByText(FAKE_OPENAI_KEY)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(FAKE_OPENAI_KEY);
  });
});

test.describe("Telegram step (#104)", () => {
  let setup: SetupPage;

  test.beforeEach(async ({ page }) => {
    setup = new SetupPage(page);
    await setup.stubStatus({ complete: false, hasProvider: false, hasTelegram: false });
    await setup.stubValidateKey({ valid: true, provider: "openai", stored: true });
    await setup.goto();
    await setup.advanceFromWelcome();
    await setup.completeProviderStep("OpenAI", FAKE_OPENAI_KEY);
    await expect(setup.stepTitle("Connect your Telegram bot")).toBeVisible();
  });

  // AC (#129/#104): a successful verify shows a confirmation.
  test("shows a confirmation on verify success", async () => {
    await setup.stubTelegramVerify({ valid: true, stored: true, botUsername: "ozs_e2e_bot" });

    await setup.botTokenInput.fill(FAKE_BOT_TOKEN);
    await setup.adminChatIdInput.fill(FAKE_CHAT_ID);
    await setup.verifyButton.click();

    await expect(setup.successStatus).toContainText("@ozs_e2e_bot");
    await expect(setup.successStatus).toContainText(/test message/i);
    await expect(setup.finishButton).toBeEnabled();
  });

  // AC (#104): a failed verify shows an error and does not enable completion.
  test("shows an error on verify failure", async () => {
    await setup.stubTelegramVerify({ valid: false, reason: "Bot token rejected" });

    await setup.botTokenInput.fill("000:bad-token");
    await setup.adminChatIdInput.fill(FAKE_CHAT_ID);
    await setup.verifyButton.click();

    await expect(setup.errorAlert).toContainText("Bot token rejected");
    await expect(setup.finishButton).toBeDisabled();
  });
});

test.describe("Wizard completion (#129)", () => {
  let setup: SetupPage;

  test.beforeEach(async ({ page }) => {
    setup = new SetupPage(page);
    await setup.stubStatus({ complete: false, hasProvider: false, hasTelegram: false });
    await setup.stubValidateKey({ valid: true, provider: "openai", stored: true });
    await setup.stubTelegramVerify({ valid: true, stored: true, botUsername: "ozs_e2e_bot" });
    await setup.goto();
    await setup.advanceFromWelcome();
    await setup.completeProviderStep("OpenAI", FAKE_OPENAI_KEY);
    await setup.botTokenInput.fill(FAKE_BOT_TOKEN);
    await setup.adminChatIdInput.fill(FAKE_CHAT_ID);
    await setup.verifyButton.click();
    await expect(setup.successStatus).toContainText(/connected/i);
  });

  // AC (#129): finishing step 3 reveals the main-app CTA and the optional
  // polished-wizard (#100) follow-up link (which is not required to proceed).
  test("shows the main-app CTA and the optional polished-wizard link", async () => {
    await setup.finishButton.click();

    await expect(setup.stepTitle("You're all set")).toBeVisible();

    await test.step("main app is reachable via the dashboard CTA", async () => {
      await expect(setup.dashboardLink).toBeVisible();
      await expect(setup.dashboardLink).toHaveAttribute("href", "/");
    });

    await test.step("polished wizard (#100) is offered as an optional follow-up", async () => {
      await expect(setup.fullWizardLink).toBeVisible();
      await expect(setup.fullWizardLink).toHaveAttribute("href", "/settings");
    });
  });
});
