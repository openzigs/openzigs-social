import type { Locator, Page, Route } from "@playwright/test";

/** Ordered step labels rendered by the wizard's step indicator (#101). */
export const STEP_LABELS = ["Welcome", "AI provider", "Telegram"] as const;

/** Human-readable provider radio labels (#103). */
export const PROVIDER_LABELS = ["OpenAI", "Anthropic", "OpenAI-compatible"] as const;
export type ProviderLabel = (typeof PROVIDER_LABELS)[number];

/**
 * Page Object for the minimal setup wizard route (`/setup`, epic #129).
 *
 * The wizard talks to a local backend for all secret validation. These page
 * objects expose `stub*` helpers so specs intercept the backend deterministically
 * via `page.route` — no real provider `/models` or Telegram `getMe`/`sendMessage`
 * calls are ever made.
 */
export class SetupPage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly stepIndicator: Locator;
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly finishButton: Locator;

  // Provider step (#103)
  readonly apiKeyInput: Locator;
  readonly baseUrlInput: Locator;
  readonly validateButton: Locator;

  // Telegram step (#104)
  readonly botTokenInput: Locator;
  readonly adminChatIdInput: Locator;
  readonly verifyButton: Locator;

  // Shared status surfaces
  readonly successStatus: Locator;
  readonly errorAlert: Locator;

  // Completion screen
  readonly dashboardLink: Locator;
  readonly fullWizardLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = page.getByRole("heading", { name: "Setup", level: 1 });
    this.stepIndicator = page.getByRole("list", { name: /Setup progress/i });
    this.nextButton = page.getByRole("button", { name: "Next" });
    this.backButton = page.getByRole("button", { name: "Back" });
    this.finishButton = page.getByRole("button", { name: "Finish" });

    this.apiKeyInput = page.getByLabel("API key");
    this.baseUrlInput = page.getByLabel("Base URL");
    this.validateButton = page.getByRole("button", { name: "Validate & save" });

    this.botTokenInput = page.getByLabel("Bot token");
    this.adminChatIdInput = page.getByLabel("Admin chat id");
    this.verifyButton = page.getByRole("button", { name: "Verify & save" });

    // Scope status/alert to the main landmark so the Next.js route announcer
    // (an empty `role="alert"` appended to <body>) never collides with these.
    const main = page.getByRole("main");
    this.successStatus = main.getByRole("status");
    this.errorAlert = main.getByRole("alert");

    this.dashboardLink = page.getByRole("link", { name: "Go to dashboard" });
    this.fullWizardLink = page.getByRole("link", { name: "full setup wizard" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/setup");
  }

  /** The wizard's main step title (rendered as plain text, not a heading). */
  stepTitle(title: string): Locator {
    return this.page.getByText(title, { exact: true });
  }

  providerRadio(label: ProviderLabel): Locator {
    return this.page.getByRole("radio", { name: label, exact: true });
  }

  async selectProvider(label: ProviderLabel): Promise<void> {
    await this.providerRadio(label).click();
  }

  /** Step 0 → step 1 (Welcome is always advanceable). */
  async advanceFromWelcome(): Promise<void> {
    await this.nextButton.click();
  }

  /**
   * Drive the provider step to success and advance to the Telegram step.
   * Caller must register a `validate-key` stub returning `{ valid: true }` first.
   */
  async completeProviderStep(label: ProviderLabel, apiKey: string): Promise<void> {
    await this.selectProvider(label);
    await this.apiKeyInput.fill(apiKey);
    await this.validateButton.click();
    await this.successStatus.waitFor();
    await this.nextButton.click();
  }

  // --- Backend stubs (no real network) --------------------------------------

  /** Stub `POST /api/setup/validate-key` with a fixed JSON body. */
  async stubValidateKey(body: Record<string, unknown>, status = 200): Promise<void> {
    await this.page.route("**/api/setup/validate-key", (route: Route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body)
      })
    );
  }

  /** Stub `POST /api/setup/telegram/verify` with a fixed JSON body. */
  async stubTelegramVerify(body: Record<string, unknown>, status = 200): Promise<void> {
    await this.page.route("**/api/setup/telegram/verify", (route: Route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body)
      })
    );
  }

  /** Stub `GET /api/setup/status` with a fixed JSON body. */
  async stubStatus(body: Record<string, unknown>): Promise<void> {
    await this.page.route("**/api/setup/status", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body)
      })
    );
  }
}
