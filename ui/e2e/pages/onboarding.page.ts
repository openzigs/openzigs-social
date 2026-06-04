import type { Locator, Page, Route } from "@playwright/test";

import type {
  ApplyRecipeResult,
  AuthorizeResult,
  ImportBrandVoiceResult,
  ModelStatus,
  OnboardingStep,
  PullModelResult,
  SaveMetaAppResult,
  SelectModelResult,
  SocialSetupStatus,
  StarterRecipe
} from "@/lib/onboarding";

/** Human-readable tab labels, mirroring `STEP_LABELS` in `@/lib/onboarding`. */
export const STEP_TAB_LABELS: Record<OnboardingStep, string> = {
  model: "Local model",
  social: "Connect platforms",
  meta: "Meta app",
  recipe: "Starter recipe",
  "brand-voice": "Brand voice"
};

/**
 * Page Object for the onboarding admin panel (`/onboarding`, epic #100 and
 * subs #102/#105/#106/#107).
 *
 * Every step fetches from the server routers under `/api/model`,
 * `/api/social-setup`, and `/api/onboarding`. Those calls hit external services
 * (the Ollama daemon, OAuth providers, the Meta graph) in production, so the
 * panel's endpoints are intercepted with `page.route` and answered
 * deterministically — the suite runs offline with no real daemon, keys, or
 * tokens.
 */
export class OnboardingPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly relaunchButton: Locator;
  readonly restartButton: Locator;
  readonly tablist: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Onboarding", level: 1 });
    this.relaunchButton = page.getByRole("button", { name: "Re-launch tour" });
    this.restartButton = page.getByRole("button", { name: "Restart setup" });
    this.tablist = page.getByRole("tablist");
  }

  async goto(): Promise<void> {
    await this.page.goto("/onboarding");
  }

  // ─────────────────────────── tab navigation ───────────────────────────

  tab(step: OnboardingStep): Locator {
    return this.page.getByRole("tab", { name: new RegExp(STEP_TAB_LABELS[step]) });
  }

  async openStep(step: OnboardingStep): Promise<void> {
    await this.tab(step).click();
  }

  /** The per-step status badge ("✓" done / "skipped" / "to do"). */
  statusBadge(step: OnboardingStep): Locator {
    return this.page.getByTestId(`status-${step}`);
  }

  skipButton(): Locator {
    return this.page.getByRole("button", { name: "Skip this step" });
  }

  // ───────────────────────────── model (#102) ───────────────────────────

  readonly ollamaState = (): Locator => this.page.getByTestId("ollama-state");
  readonly recommendedVariant = (): Locator => this.page.getByTestId("recommended-variant");
  readonly modelVariantSelect = (): Locator => this.page.getByLabel("Model variant");
  readonly useModelButton = (): Locator =>
    this.page.getByRole("button", { name: "Use this model" });

  byokChip(label: string): Locator {
    // Anchor the label so "OpenAI" does not also match the "OpenAI-compatible"
    // chip; the configured chip renders a trailing " ✓".
    return this.page.getByTestId("byok-chip").filter({ hasText: new RegExp(`^${label}( ✓)?$`) });
  }

  pullButton(variant: string): Locator {
    return this.page.getByRole("button", { name: `Pull ${variant}` });
  }

  readonly youtubeWidget = (): Locator => this.page.getByTestId("widget-youtube");
  readonly creditWidget = (): Locator => this.page.getByTestId("widget-credit");

  async stubModelStatus(status: ModelStatus): Promise<void> {
    await this.page.route(/\/api\/model\/status(?:\?.*)?$/, (route: Route) => {
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(status)
      });
    });
  }

  async stubModelSelect(result: SelectModelResult): Promise<void> {
    await this.page.route(/\/api\/model\/select$/, (route: Route) => {
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result)
      });
    });
  }

  async stubModelPull(result: PullModelResult): Promise<void> {
    await this.page.route(/\/api\/model\/pull$/, (route: Route) => {
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result)
      });
    });
  }

  // ─────────────────────── social + meta (#105/#106) ────────────────────

  platformState(platform: string): Locator {
    return this.page.getByTestId(`state-${platform}`);
  }

  connectButton(platform: string): Locator {
    return this.page
      .getByRole("listitem")
      .filter({ has: this.platformState(platform) })
      .getByRole("button");
  }

  async stubSocialStatus(status: SocialSetupStatus): Promise<void> {
    await this.page.route(/\/api\/social-setup\/status(?:\?.*)?$/, (route: Route) => {
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(status)
      });
    });
  }

  async stubAuthorize(result: AuthorizeResult): Promise<void> {
    await this.page.route(/\/api\/social-setup\/[^/]+\/authorize$/, (route: Route) => {
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result)
      });
    });
  }

  readonly metaAppIdInput = (): Locator => this.page.getByLabel("App ID");
  readonly metaAppSecretInput = (): Locator => this.page.getByLabel("App Secret");
  readonly saveMetaButton = (): Locator => this.page.getByRole("button", { name: "Save Meta app" });
  readonly metaScopes = (): Locator => this.page.getByTestId("meta-scopes");
  readonly copyScopesButton = (): Locator => this.page.getByRole("button", { name: "Copy" });

  async stubSaveMetaApp(result: SaveMetaAppResult): Promise<void> {
    await this.page.route(/\/api\/social-setup\/meta\/app$/, (route: Route) => {
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result)
      });
    });
  }

  // ──────────────────── recipes + brand voice (#107 + AC) ────────────────

  recipeCard(id: string): Locator {
    return this.page.getByTestId(`recipe-${id}`);
  }

  useRecipeButton(id: string): Locator {
    return this.recipeCard(id).getByRole("button");
  }

  async stubRecipes(recipes: StarterRecipe[]): Promise<void> {
    await this.page.route(/\/api\/onboarding\/recipes$/, (route: Route) => {
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ timestamp: new Date().toISOString(), recipes })
      });
    });
  }

  async stubApplyRecipe(result: ApplyRecipeResult): Promise<void> {
    await this.page.route(/\/api\/onboarding\/recipes\/apply$/, (route: Route) => {
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result)
      });
    });
  }

  readonly brandVoiceFormat = (): Locator => this.page.getByLabel("Import format");
  readonly brandVoiceContent = (): Locator => this.page.getByLabel("Brand voice content");
  readonly brandVoiceUpload = (): Locator => this.page.getByLabel("Upload brand voice file");
  readonly importButton = (): Locator => this.page.getByRole("button", { name: "Import examples" });

  async stubImportBrandVoice(result: ImportBrandVoiceResult): Promise<void> {
    await this.page.route(/\/api\/onboarding\/brand-voice\/import$/, (route: Route) => {
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result)
      });
    });
  }
}
