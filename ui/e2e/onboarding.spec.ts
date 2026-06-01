import { expect, test } from "@playwright/test";

import type {
  ModelStatus,
  PlatformSetupStatus,
  SocialSetupStatus,
  StarterRecipe
} from "@/lib/onboarding";

import { OnboardingPage } from "./pages/onboarding.page";

// ─────────────────────────────── fixtures ──────────────────────────────

const GEMMA_VARIANTS = ["gemma4:e8b", "gemma4:e4b", "gemma4:e2b"];

function reachableModel(): ModelStatus {
  return {
    timestamp: new Date().toISOString(),
    ollama: {
      reachable: true,
      baseUrl: "http://127.0.0.1:11434",
      installedVariant: "gemma4:e4b",
      recommendedVariant: "gemma4:e4b",
      variants: GEMMA_VARIANTS,
      models: ["gemma4:e4b", "gemma4:e2b"]
    },
    providers: [
      { id: "openai", label: "OpenAI", configured: false },
      { id: "anthropic", label: "Anthropic", configured: false },
      { id: "openai-compatible", label: "OpenAI-compatible", configured: false }
    ],
    selection: null,
    source: "local",
    widgets: { youtubeQuota: { available: false }, byokCredit: { available: false } }
  };
}

function unreachableModel(): ModelStatus {
  return {
    timestamp: new Date().toISOString(),
    ollama: {
      reachable: false,
      baseUrl: "http://127.0.0.1:11434",
      installedVariant: null,
      recommendedVariant: "gemma4:e2b",
      variants: [],
      models: []
    },
    providers: [
      { id: "openai", label: "OpenAI", configured: true },
      { id: "anthropic", label: "Anthropic", configured: false },
      { id: "openai-compatible", label: "OpenAI-compatible", configured: false }
    ],
    selection: { provider: "openai" },
    source: "byok",
    widgets: { youtubeQuota: { available: false }, byokCredit: { available: true } }
  };
}

function platform(
  overrides: Partial<PlatformSetupStatus> & { platform: string }
): PlatformSetupStatus {
  return {
    label: overrides.platform,
    appConfigured: false,
    connected: false,
    needsReconsent: false,
    scopes: [],
    redirectUri: `https://localhost/api/social-setup/${overrides.platform}/callback`,
    ...overrides
  };
}

function socialStatus(): SocialSetupStatus {
  return {
    timestamp: new Date().toISOString(),
    platforms: [
      platform({ platform: "instagram", label: "Instagram", appConfigured: true }),
      platform({ platform: "facebook", label: "Facebook", appConfigured: true, connected: true }),
      platform({
        platform: "threads",
        label: "Threads",
        appConfigured: true,
        needsReconsent: true
      }),
      platform({ platform: "linkedin", label: "LinkedIn", appConfigured: false })
    ]
  };
}

function recipes(): StarterRecipe[] {
  const make = (id: string, label: string): StarterRecipe => ({
    id,
    label,
    description: `${label} starter preset`,
    tone: "Warm and direct",
    bannedWords: ["synergy"],
    exemplars: [`${label} example one`, `${label} example two`],
    suggestedPlatforms: ["instagram", "linkedin"],
    cadencePerWeek: 5
  });
  return [
    make("creator", "Creator"),
    make("small-biz", "Small business"),
    make("agency", "Agency")
  ];
}

// ──────────────────────────── model panel (#102) ───────────────────────

test.describe("Model panel (#102)", () => {
  let onboarding: OnboardingPage;

  test.beforeEach(({ page }) => {
    onboarding = new OnboardingPage(page);
  });

  // AC (#102): Ollama reachable → auto-detected Gemma 4 variant is shown.
  test("auto-detects the recommended Gemma 4 variant when Ollama is reachable", async () => {
    await onboarding.stubModelStatus(reachableModel());
    await onboarding.goto();

    await expect(onboarding.ollamaState()).toHaveText("Ollama detected");
    await expect(onboarding.recommendedVariant()).toContainText("gemma4:e4b");

    await test.step("the variant dropdown lists every Gemma 4 variant", async () => {
      for (const variant of GEMMA_VARIANTS) {
        await expect(
          onboarding.modelVariantSelect().getByRole("option", { name: new RegExp(variant) })
        ).toHaveCount(1);
      }
    });
  });

  // AC (#102): overriding to a different installed model persists the selection
  // (the wrapper rebinds without restart — the panel POSTs the new selection).
  test("persists an override to a different installed model", async ({ page }) => {
    await onboarding.stubModelStatus(reachableModel());
    await onboarding.stubModelSelect({
      selected: true,
      selection: { provider: "local", model: "gemma4:e2b" }
    });
    await onboarding.goto();

    await onboarding.modelVariantSelect().selectOption("gemma4:e2b");

    const selectRequest = page.waitForRequest(/\/api\/model\/select$/);
    await onboarding.useModelButton().click();
    const request = await selectRequest;

    expect(JSON.parse(request.postData() ?? "{}")).toMatchObject({
      provider: "local",
      model: "gemma4:e2b"
    });
    await expect(onboarding.statusBadge("model")).toHaveText("✓");
  });

  // AC (task): the pull flow is reachable for a not-yet-installed variant.
  test("offers a pull control for a variant that is not installed yet", async () => {
    await onboarding.stubModelStatus(reachableModel());
    await onboarding.stubModelPull({
      pulling: true,
      model: "gemma4:e8b",
      status: "downloading"
    });
    await onboarding.goto();

    await onboarding.modelVariantSelect().selectOption("gemma4:e8b");
    await expect(onboarding.pullButton("gemma4:e8b")).toBeVisible();

    await onboarding.pullButton("gemma4:e8b").click();
    await expect(onboarding.page.getByText("Pulling model", { exact: true })).toBeVisible();
  });

  // AC (#102): Ollama unreachable → BYOK chips surface and the configured
  // provider is highlighted.
  test("surfaces BYOK provider chips when Ollama is unreachable", async () => {
    await onboarding.stubModelStatus(unreachableModel());
    await onboarding.goto();

    await expect(onboarding.ollamaState()).toHaveText("Ollama not detected");
    await expect(onboarding.byokChip("OpenAI")).toContainText("✓");
    await expect(onboarding.byokChip("Anthropic")).not.toContainText("✓");
  });

  // AC (#102): the YouTube-quota and BYOK-credit widgets are surfaced inline.
  test("surfaces the YouTube quota and BYOK credit widgets inline", async () => {
    await onboarding.stubModelStatus(reachableModel());
    await onboarding.goto();

    await expect(onboarding.youtubeWidget()).toBeVisible();
    await expect(onboarding.creditWidget()).toBeVisible();
  });
});

// ───────────────────────── social connect (#105) ───────────────────────

test.describe("Per-platform OAuth connect step (#105)", () => {
  let onboarding: OnboardingPage;

  test.beforeEach(async ({ page }) => {
    onboarding = new OnboardingPage(page);
    await onboarding.stubModelStatus(reachableModel());
    await onboarding.stubSocialStatus(socialStatus());
    await onboarding.goto();
    await onboarding.openStep("social");
  });

  // AC (#105): each platform renders its app-configured / connected / reconsent
  // state.
  test("renders every per-platform connect state", async () => {
    await expect(onboarding.platformState("instagram")).toHaveText("Ready to connect");
    await expect(onboarding.platformState("facebook")).toHaveText("Connected");
    await expect(onboarding.platformState("threads")).toHaveText("Reconnect needed");
    await expect(onboarding.platformState("linkedin")).toHaveText("App not configured");
  });

  // AC (#105): the connect button is disabled until the platform app is
  // configured.
  test("disables connect for a platform whose app is not configured", async () => {
    await expect(onboarding.connectButton("linkedin")).toBeDisabled();
    await expect(onboarding.connectButton("instagram")).toBeEnabled();
  });

  // AC (#105): connecting a configured platform opens its OAuth authorize URL.
  test("opens an OAuth authorize window for a configured platform", async ({ page }) => {
    await onboarding.stubAuthorize({
      platform: "instagram",
      url: "https://example.com/oauth/instagram",
      state: "csrf-state",
      redirectUri: "https://localhost/api/social-setup/instagram/callback",
      scopes: ["instagram_basic"]
    });

    const popupPromise = page.waitForEvent("popup");
    await onboarding.connectButton("instagram").click();
    const popup = await popupPromise;
    await popup.close();

    await expect(onboarding.statusBadge("social")).toHaveText("✓");
  });
});

// ───────────────────────── Meta app wizard (#106) ───────────────────────

test.describe("Meta app wizard (#106)", () => {
  let onboarding: OnboardingPage;

  const META_TITLES = [
    "Create an app",
    "Add products",
    "Copy credentials",
    "Register redirect URIs"
  ];

  test.beforeEach(async ({ page }) => {
    onboarding = new OnboardingPage(page);
    await onboarding.stubModelStatus(reachableModel());
    await onboarding.goto();
    await onboarding.openStep("meta");
  });

  // AC (#106): the wizard lays out numbered, screenshot-backed steps.
  test("renders the numbered setup steps with screenshots", async ({ page }) => {
    for (const title of META_TITLES) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await expect(page.getByRole("img", { name: `Screenshot: ${title}` })).toBeVisible();
    }
  });

  // AC (#106): saving the app surfaces copy-pasteable scopes + redirect URIs.
  test("saves the app and shows copy-pasteable scopes and redirect URIs", async ({ page }) => {
    await onboarding.stubSaveMetaApp({
      stored: true,
      appId: "123456789012345",
      scopes: ["instagram_basic", "pages_show_list"],
      redirectUris: [
        { platform: "instagram", redirectUri: "https://localhost/cb/instagram" },
        { platform: "facebook", redirectUri: "https://localhost/cb/facebook" }
      ]
    });

    await onboarding.metaAppIdInput().fill("123456789012345");
    await onboarding.metaAppSecretInput().fill("super-secret-app-value");
    await onboarding.saveMetaButton().click();

    await expect(onboarding.metaScopes()).toHaveText("instagram_basic,pages_show_list");
    await expect(page.getByText("https://localhost/cb/instagram")).toBeVisible();
    await expect(page.getByText("https://localhost/cb/facebook")).toBeVisible();
    await expect(onboarding.statusBadge("meta")).toHaveText("✓");
  });

  // AC (#106): one-click scope copy writes the scopes to the clipboard.
  test("copies the scopes to the clipboard in one click", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await onboarding.stubSaveMetaApp({
      stored: true,
      appId: "123456789012345",
      scopes: ["instagram_basic", "pages_show_list"],
      redirectUris: [{ platform: "instagram", redirectUri: "https://localhost/cb/instagram" }]
    });

    await onboarding.metaAppIdInput().fill("123456789012345");
    await onboarding.metaAppSecretInput().fill("super-secret-app-value");
    await onboarding.saveMetaButton().click();
    await expect(onboarding.metaScopes()).toBeVisible();

    await onboarding.copyScopesButton().click();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe("instagram_basic,pages_show_list");
  });

  // Security: the write-only App Secret never returns to the rendered DOM.
  test("never renders the App Secret back into the DOM after save", async ({ page }) => {
    await onboarding.stubSaveMetaApp({
      stored: true,
      appId: "123456789012345",
      scopes: ["instagram_basic"],
      redirectUris: [{ platform: "instagram", redirectUri: "https://localhost/cb/instagram" }]
    });

    await onboarding.metaAppIdInput().fill("123456789012345");
    await onboarding.metaAppSecretInput().fill("super-secret-app-value");
    await onboarding.saveMetaButton().click();
    await expect(onboarding.metaScopes()).toBeVisible();

    await expect(onboarding.metaAppSecretInput()).toHaveValue("");
    await expect(page.getByText("super-secret-app-value")).toHaveCount(0);
  });
});

// ───────────────────── recipe picker + brand voice (#107 + AC) ──────────

test.describe("Starter recipe picker (#107)", () => {
  let onboarding: OnboardingPage;

  test.beforeEach(async ({ page }) => {
    onboarding = new OnboardingPage(page);
    await onboarding.stubModelStatus(reachableModel());
    await onboarding.stubRecipes(recipes());
    await onboarding.goto();
    await onboarding.openStep("recipe");
  });

  // AC (#107): the creator / small-biz / agency presets are presented.
  test("presents the creator, small-business, and agency presets", async () => {
    await expect(onboarding.recipeCard("creator")).toContainText("Creator");
    await expect(onboarding.recipeCard("small-biz")).toContainText("Small business");
    await expect(onboarding.recipeCard("agency")).toContainText("Agency");
  });

  // AC (#107): applying a preset seeds the brand-voice rulebook and marks the
  // step done.
  test("applies a preset and marks the recipe step done", async () => {
    await onboarding.stubApplyRecipe({
      applied: true,
      recipe: "creator",
      rulebook: { tone: "Warm and direct", bannedWords: ["synergy"], exemplars: ["a", "b"] },
      suggestedPlatforms: ["instagram", "linkedin"],
      cadencePerWeek: 5
    });

    await onboarding.useRecipeButton("creator").click();

    await expect(onboarding.recipeCard("creator")).toContainText("Applied");
    await expect(onboarding.statusBadge("recipe")).toHaveText("✓");
  });
});

test.describe("Brand-voice import (#100 AC)", () => {
  let onboarding: OnboardingPage;

  test.beforeEach(async ({ page }) => {
    onboarding = new OnboardingPage(page);
    await onboarding.stubModelStatus(reachableModel());
    await onboarding.stubImportBrandVoice({
      imported: true,
      added: 2,
      rulebook: { tone: "Warm", bannedWords: [], exemplars: ["a", "b"] }
    });
    await onboarding.goto();
    await onboarding.openStep("brand-voice");
  });

  // AC (#100): the brand-voice panel accepts pasted sample posts and builds the
  // exemplar set.
  test("imports pasted sample posts", async () => {
    await onboarding.brandVoiceContent().fill("First example post\nSecond example post");
    await onboarding.importButton().click();

    await expect(onboarding.statusBadge("brand-voice")).toHaveText("✓");
    await expect(onboarding.brandVoiceContent()).toHaveValue("");
  });

  // AC (#100): the brand-voice panel accepts a JSON/CSV upload and builds the
  // exemplar set.
  test("imports an uploaded JSON export", async () => {
    await onboarding.brandVoiceUpload().setInputFiles({
      name: "exemplars.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(["First exemplar", "Second exemplar"]))
    });

    await expect(onboarding.brandVoiceFormat()).toHaveValue("json");
    await expect(onboarding.brandVoiceContent()).not.toHaveValue("");

    await onboarding.importButton().click();
    await expect(onboarding.statusBadge("brand-voice")).toHaveText("✓");
  });
});

// ───────────────── skippable + re-launchable (epic #100 AC) ─────────────

test.describe("Skip and re-launch (#100)", () => {
  let onboarding: OnboardingPage;

  test.beforeEach(async ({ page }) => {
    onboarding = new OnboardingPage(page);
    await onboarding.stubModelStatus(reachableModel());
    await onboarding.stubRecipes(recipes());
    await onboarding.goto();
  });

  // AC (#100): every polish step is skippable.
  test("skips a step from its panel", async () => {
    await onboarding.openStep("recipe");
    await expect(onboarding.statusBadge("recipe")).toHaveText("to do");

    await onboarding.skipButton().click();

    await expect(onboarding.statusBadge("recipe")).toHaveText("skipped");
  });

  // AC (#100): skip state persists across a reload (it is durable progress).
  test("keeps a skipped step skipped across a reload", async ({ page }) => {
    await onboarding.openStep("recipe");
    await onboarding.skipButton().click();
    await expect(onboarding.statusBadge("recipe")).toHaveText("skipped");

    await page.reload();
    await expect(onboarding.statusBadge("recipe")).toHaveText("skipped");
  });

  // AC (#100): the whole flow is re-launchable from the admin panel, resetting
  // progress back to "to do".
  test("re-launches the flow and resets progress", async () => {
    await onboarding.openStep("recipe");
    await onboarding.skipButton().click();
    await expect(onboarding.statusBadge("recipe")).toHaveText("skipped");

    await onboarding.relaunchButton.click();

    await expect(onboarding.statusBadge("recipe")).toHaveText("to do");
    await expect(onboarding.statusBadge("model")).toHaveText("to do");
  });
});
