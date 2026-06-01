import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ONBOARDING_STEPS,
  TOUR_SECTIONS,
  applyRecipe,
  authorizePlatform,
  completeStep,
  dismissTourSection,
  fetchModelStatus,
  fetchRecipes,
  fetchSocialSetupStatus,
  getProgressSnapshot,
  getTourSnapshot,
  importBrandVoice,
  isOnboardingComplete,
  isTourSectionDismissed,
  pullModel,
  relaunchOnboarding,
  relaunchTour,
  saveMetaApp,
  selectModel,
  skipStep,
  stepStatus,
  subscribeOnboarding,
  type ModelStatus,
  type OnboardingProgress
} from "./onboarding";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("onboarding API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches model status", async () => {
    const payload: ModelStatus = {
      timestamp: "t",
      ollama: {
        reachable: true,
        baseUrl: "http://localhost:11434/v1",
        installedVariant: null,
        recommendedVariant: "gemma4:e4b",
        variants: ["gemma4:e8b", "gemma4:e4b", "gemma4:e2b"],
        models: []
      },
      providers: [{ id: "openai", label: "OpenAI", configured: false }],
      selection: null,
      source: "local",
      widgets: { youtubeQuota: { available: false }, byokCredit: { available: false } }
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
    const result = await fetchModelStatus();
    expect(result.ollama.recommendedVariant).toBe("gemma4:e4b");
  });

  it("throws when a GET returns a non-2xx status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchModelStatus()).rejects.toThrow(/HTTP 500/);
  });

  it("selects a model", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({ selected: true, selection: { provider: "local", model: "gemma4:e4b" } })
      );
    const result = await selectModel({ provider: "local", model: "gemma4:e4b" });
    expect(result.selected).toBe(true);
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      provider: "local",
      model: "gemma4:e4b"
    });
  });

  it("pulls a model variant", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ pulling: true, model: "gemma4:e4b", status: "success" })
    );
    const result = await pullModel("gemma4:e4b");
    expect(result.status).toBe("success");
  });

  it("fetches social setup status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ timestamp: "t", platforms: [{ platform: "facebook" }] })
    );
    const result = await fetchSocialSetupStatus();
    expect(result.platforms[0].platform).toBe("facebook");
  });

  it("authorizes a platform", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        platform: "facebook",
        url: "https://example.com/auth",
        state: "s",
        redirectUri: "r",
        scopes: []
      })
    );
    const result = await authorizePlatform("facebook");
    expect(result.url).toContain("https://");
  });

  it("saves the Meta app credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ stored: true, appId: "123", scopes: [], redirectUris: [] })
    );
    const result = await saveMetaApp("123", "secret");
    expect(result.stored).toBe(true);
  });

  it("fetches recipes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ timestamp: "t", recipes: [{ id: "creator" }] })
    );
    const recipes = await fetchRecipes();
    expect(recipes[0].id).toBe("creator");
  });

  it("applies a recipe", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        applied: true,
        recipe: "creator",
        rulebook: { tone: "x", bannedWords: [], exemplars: [] },
        suggestedPlatforms: ["tiktok"],
        cadencePerWeek: 7
      })
    );
    const result = await applyRecipe("creator");
    expect(result.applied).toBe(true);
  });

  it("imports brand voice", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({
          imported: true,
          added: 2,
          rulebook: { tone: "", bannedWords: [], exemplars: ["a", "b"] }
        })
      );
    const result = await importBrandVoice("csv", "a\nb");
    expect(result.added).toBe(2);
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      format: "csv",
      content: "a\nb"
    });
  });
});

describe("tour state", () => {
  beforeEach(() => {
    localStorage.clear();
    relaunchTour();
  });

  it("starts with no dismissed sections", () => {
    expect(getTourSnapshot().dismissed).toEqual([]);
  });

  it("dismisses a section and reports it dismissed", () => {
    dismissTourSection("inbox");
    expect(isTourSectionDismissed("inbox")).toBe(true);
    expect(isTourSectionDismissed("scheduler")).toBe(false);
  });

  it("ignores a duplicate dismissal", () => {
    dismissTourSection("inbox");
    dismissTourSection("inbox");
    expect(getTourSnapshot().dismissed).toEqual(["inbox"]);
  });

  it("relaunch clears dismissals", () => {
    TOUR_SECTIONS.forEach(dismissTourSection);
    relaunchTour();
    expect(getTourSnapshot().dismissed).toEqual([]);
  });

  it("drops unknown sections from persisted state", () => {
    localStorage.setItem("ozs.onboarding.tour", JSON.stringify({ dismissed: ["inbox", "evil"] }));
    expect(getTourSnapshot().dismissed).toEqual(["inbox"]);
  });

  it("recovers from a non-array dismissed field", () => {
    localStorage.setItem("ozs.onboarding.tour", JSON.stringify({ dismissed: "nope" }));
    expect(getTourSnapshot().dismissed).toEqual([]);
  });

  it("returns a stable reference when storage is unchanged", () => {
    dismissTourSection("inbox");
    expect(getTourSnapshot()).toBe(getTourSnapshot());
  });

  it("notifies subscribers and unsubscribes cleanly", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOnboarding(listener);
    dismissTourSection("scheduler");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    relaunchTour();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("onboarding progress", () => {
  beforeEach(() => {
    localStorage.clear();
    relaunchOnboarding();
  });

  it("starts with nothing completed or skipped", () => {
    expect(getProgressSnapshot()).toEqual({ completed: [], skipped: [] });
  });

  it("marks a step complete", () => {
    completeStep("model");
    expect(stepStatus(getProgressSnapshot(), "model")).toBe("done");
  });

  it("skips a step", () => {
    skipStep("meta");
    expect(stepStatus(getProgressSnapshot(), "meta")).toBe("skipped");
  });

  it("completing clears a prior skip", () => {
    skipStep("model");
    completeStep("model");
    const p = getProgressSnapshot();
    expect(p.completed).toContain("model");
    expect(p.skipped).not.toContain("model");
  });

  it("skipping clears a prior completion", () => {
    completeStep("model");
    skipStep("model");
    const p = getProgressSnapshot();
    expect(p.skipped).toContain("model");
    expect(p.completed).not.toContain("model");
  });

  it("does not duplicate a repeated completion", () => {
    completeStep("model");
    completeStep("model");
    expect(getProgressSnapshot().completed).toEqual(["model"]);
  });

  it("reports a todo step", () => {
    expect(stepStatus(getProgressSnapshot(), "recipe")).toBe("todo");
  });

  it("is complete once every step is done or skipped", () => {
    ONBOARDING_STEPS.forEach((step, i) => (i % 2 === 0 ? completeStep(step) : skipStep(step)));
    expect(isOnboardingComplete(getProgressSnapshot())).toBe(true);
  });

  it("is not complete with an outstanding step", () => {
    completeStep("model");
    expect(isOnboardingComplete(getProgressSnapshot())).toBe(false);
  });

  it("relaunch resets progress", () => {
    completeStep("model");
    relaunchOnboarding();
    expect(getProgressSnapshot()).toEqual({ completed: [], skipped: [] });
  });

  it("drops unknown steps from persisted progress", () => {
    localStorage.setItem(
      "ozs.onboarding.progress",
      JSON.stringify({ completed: ["model", "bogus"], skipped: 5 })
    );
    const p: OnboardingProgress = getProgressSnapshot();
    expect(p.completed).toEqual(["model"]);
    expect(p.skipped).toEqual([]);
  });

  it("survives localStorage throwing on write", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => completeStep("model")).not.toThrow();
    spy.mockRestore();
  });
});
