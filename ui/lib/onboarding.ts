import { API_URL } from "./socket";

/**
 * Onboarding polish client library (epic #100).
 *
 * Mirrors the server routers under `/api/model`, `/api/social-setup`, and
 * `/api/onboarding`. Follows the same conventions as `./setup.ts`: plain async
 * fetchers plus `localStorage`-backed UI state (tour + onboarding progress)
 * exposed through `useSyncExternalStore`-friendly snapshot/subscribe helpers.
 *
 * NOTE: persisted state stores only non-secret progress flags. App secrets and
 * BYOK keys live server-side in the encrypted vault — never here.
 */

// ───────────────────────────── Model panel (#102) ─────────────────────────────

export type ModelProvider = "local" | "openai" | "anthropic" | "openai-compatible";
export type ModelSource = "local" | "byok";

export interface ModelSelection {
  provider: ModelProvider;
  model?: string;
}

export interface ByokProviderChip {
  id: "openai" | "anthropic" | "openai-compatible";
  label: string;
  configured: boolean;
}

export interface OllamaStatus {
  reachable: boolean;
  baseUrl: string;
  installedVariant: string | null;
  recommendedVariant: string;
  variants: string[];
  models: string[];
}

export interface ModelWidgets {
  youtubeQuota: { available: boolean };
  byokCredit: { available: boolean };
}

export interface ModelStatus {
  timestamp: string;
  ollama: OllamaStatus;
  providers: ByokProviderChip[];
  selection: ModelSelection | null;
  source: ModelSource;
  widgets: ModelWidgets;
}

export interface SelectModelResult {
  selected: boolean;
  selection: ModelSelection;
}

export interface PullModelResult {
  pulling: boolean;
  model: string;
  status: string;
  error?: string;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal });
  if (!res.ok) throw new Error(`request failed (HTTP ${res.status})`);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return (await res.json()) as T;
}

/** Fetch the model panel status (Ollama probe + BYOK chips + selection). */
export function fetchModelStatus(signal?: AbortSignal): Promise<ModelStatus> {
  return getJson<ModelStatus>("/api/model/status", signal);
}

/** Persist a model selection (local variant or a configured BYOK provider). */
export function selectModel(selection: ModelSelection): Promise<SelectModelResult> {
  return postJson<SelectModelResult>("/api/model/select", selection);
}

/** Ask the local Ollama runtime to pull a model variant. */
export function pullModel(model: string): Promise<PullModelResult> {
  return postJson<PullModelResult>("/api/model/pull", { model });
}

// ─────────────────────── Social setup + Meta wizard (#105/#106) ───────────────

export interface PlatformSetupStatus {
  platform: string;
  label: string;
  appConfigured: boolean;
  connected: boolean;
  needsReconsent: boolean;
  scopes: string[];
  redirectUri: string;
}

export interface SocialSetupStatus {
  timestamp: string;
  platforms: PlatformSetupStatus[];
}

export interface AuthorizeResult {
  platform: string;
  url: string;
  state: string;
  redirectUri: string;
  scopes: string[];
}

export interface MetaRedirectUri {
  platform: string;
  redirectUri: string;
}

export interface SaveMetaAppResult {
  stored: boolean;
  appId: string;
  scopes: string[];
  redirectUris: MetaRedirectUri[];
}

/** Fetch the per-platform social setup status. */
export function fetchSocialSetupStatus(signal?: AbortSignal): Promise<SocialSetupStatus> {
  return getJson<SocialSetupStatus>("/api/social-setup/status", signal);
}

/** Mint an OAuth authorize URL for a platform. */
export function authorizePlatform(platform: string): Promise<AuthorizeResult> {
  return postJson<AuthorizeResult>(`/api/social-setup/${platform}/authorize`, {});
}

/** Store the per-user Meta app id/secret in the vault. */
export function saveMetaApp(appId: string, appSecret: string): Promise<SaveMetaAppResult> {
  return postJson<SaveMetaAppResult>("/api/social-setup/meta/app", { appId, appSecret });
}

// ──────────────────────── Recipes + brand-voice (#107 + AC) ───────────────────

export interface StarterRecipe {
  id: string;
  label: string;
  description: string;
  tone: string;
  bannedWords: string[];
  exemplars: string[];
  suggestedPlatforms: string[];
  cadencePerWeek: number;
}

export interface BrandVoiceRulebook {
  tone: string;
  bannedWords: string[];
  exemplars: string[];
}

export interface RecipesResult {
  timestamp: string;
  recipes: StarterRecipe[];
}

export interface ApplyRecipeResult {
  applied: boolean;
  recipe: string;
  rulebook: BrandVoiceRulebook;
  suggestedPlatforms: string[];
  cadencePerWeek: number;
}

export interface ImportBrandVoiceResult {
  imported?: boolean;
  added?: number;
  rulebook?: BrandVoiceRulebook;
  error?: string;
}

/** Fetch the starter recipe presets. */
export function fetchRecipes(signal?: AbortSignal): Promise<StarterRecipe[]> {
  return getJson<RecipesResult>("/api/onboarding/recipes", signal).then((r) => r.recipes);
}

/** Apply a starter recipe (seeds the brand-voice rulebook). */
export function applyRecipe(recipe: string): Promise<ApplyRecipeResult> {
  return postJson<ApplyRecipeResult>("/api/onboarding/recipes/apply", { recipe });
}

/** Import a brand-voice document (JSON or CSV) into the rulebook. */
export function importBrandVoice(
  format: "json" | "csv",
  content: string
): Promise<ImportBrandVoiceResult> {
  return postJson<ImportBrandVoiceResult>("/api/onboarding/brand-voice/import", {
    format,
    content
  });
}

// ───────────────────────────── Tour overlay (epic AC) ─────────────────────────

/** Contextual tour sections, in walkthrough order. */
export const TOUR_SECTIONS = ["inbox", "scheduler", "brand-voice"] as const;
export type TourSection = (typeof TOUR_SECTIONS)[number];

export const TOUR_LABELS: Record<TourSection, string> = {
  inbox: "Unified inbox",
  scheduler: "Scheduler",
  "brand-voice": "Brand voice"
};

export const TOUR_COPY: Record<TourSection, string> = {
  inbox: "Every reply, mention, and DM across your platforms lands here in one queue.",
  scheduler: "Draft once and schedule across platforms — the outbox publishes on cadence.",
  "brand-voice": "Paste or import examples so replies sound like you, not a robot."
};

const TOUR_STORAGE_KEY = "ozs.onboarding.tour";
const ONBOARDING_CHANGE_EVENT = "ozs-onboarding-change";

export interface TourState {
  /** Sections the user has dismissed (won't re-show). */
  dismissed: TourSection[];
}

const INITIAL_TOUR_STATE: TourState = { dismissed: [] };

function isTourSection(value: unknown): value is TourSection {
  return typeof value === "string" && (TOUR_SECTIONS as readonly string[]).includes(value);
}

function normalizeTourState(parsed: Partial<TourState> | null): TourState {
  const dismissed = Array.isArray(parsed?.dismissed) ? parsed.dismissed.filter(isTourSection) : [];
  return { dismissed: [...new Set(dismissed)] };
}

let tourCachedRaw: string | null = null;
let tourCachedState: TourState = INITIAL_TOUR_STATE;

/** SSR-safe snapshot of tour state for `useSyncExternalStore`. */
export function getTourSnapshot(): TourState {
  if (typeof window === "undefined") return INITIAL_TOUR_STATE;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(TOUR_STORAGE_KEY);
  } catch {
    return tourCachedState;
  }
  if (raw === tourCachedRaw) return tourCachedState;
  tourCachedRaw = raw;
  tourCachedState = raw
    ? normalizeTourState(JSON.parse(raw) as Partial<TourState>)
    : INITIAL_TOUR_STATE;
  return tourCachedState;
}

/** Subscribe to onboarding (tour + progress) changes. */
export function subscribeOnboarding(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(ONBOARDING_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(ONBOARDING_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function writeTourState(state: TourState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort persistence
  }
  window.dispatchEvent(new Event(ONBOARDING_CHANGE_EVENT));
}

/** True when a tour section has been dismissed. */
export function isTourSectionDismissed(section: TourSection): boolean {
  return getTourSnapshot().dismissed.includes(section);
}

/** Dismiss a single tour section. */
export function dismissTourSection(section: TourSection): void {
  const current = getTourSnapshot();
  if (current.dismissed.includes(section)) return;
  writeTourState({ dismissed: [...current.dismissed, section] });
}

/** Re-launch the full contextual tour (clears all dismissals). */
export function relaunchTour(): void {
  writeTourState({ dismissed: [] });
}

// ───────────────────── Onboarding progress (skippable/relaunch) ───────────────

/** Onboarding steps, in order. Each is skippable and re-launchable. */
export const ONBOARDING_STEPS = ["model", "social", "meta", "recipe", "brand-voice"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const STEP_LABELS: Record<OnboardingStep, string> = {
  model: "Local model",
  social: "Connect platforms",
  meta: "Meta app",
  recipe: "Starter recipe",
  "brand-voice": "Brand voice"
};

const PROGRESS_STORAGE_KEY = "ozs.onboarding.progress";

export interface OnboardingProgress {
  /** Steps the user finished. */
  completed: OnboardingStep[];
  /** Steps the user explicitly skipped. */
  skipped: OnboardingStep[];
}

const INITIAL_PROGRESS: OnboardingProgress = { completed: [], skipped: [] };

function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

function normalizeProgress(parsed: Partial<OnboardingProgress> | null): OnboardingProgress {
  const completed = Array.isArray(parsed?.completed)
    ? parsed.completed.filter(isOnboardingStep)
    : [];
  const skipped = Array.isArray(parsed?.skipped) ? parsed.skipped.filter(isOnboardingStep) : [];
  return { completed: [...new Set(completed)], skipped: [...new Set(skipped)] };
}

let progressCachedRaw: string | null = null;
let progressCachedState: OnboardingProgress = INITIAL_PROGRESS;

/** SSR-safe snapshot of onboarding progress for `useSyncExternalStore`. */
export function getProgressSnapshot(): OnboardingProgress {
  if (typeof window === "undefined") return INITIAL_PROGRESS;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
  } catch {
    return progressCachedState;
  }
  if (raw === progressCachedRaw) return progressCachedState;
  progressCachedRaw = raw;
  progressCachedState = raw
    ? normalizeProgress(JSON.parse(raw) as Partial<OnboardingProgress>)
    : INITIAL_PROGRESS;
  return progressCachedState;
}

function writeProgress(state: OnboardingProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort
  }
  window.dispatchEvent(new Event(ONBOARDING_CHANGE_EVENT));
}

/** Mark a step complete (and clear any prior skip). */
export function completeStep(step: OnboardingStep): void {
  const current = getProgressSnapshot();
  const completed = current.completed.includes(step)
    ? current.completed
    : [...current.completed, step];
  const skipped = current.skipped.filter((s) => s !== step);
  writeProgress({ completed, skipped });
}

/** Skip a step (and clear any prior completion). */
export function skipStep(step: OnboardingStep): void {
  const current = getProgressSnapshot();
  const skipped = current.skipped.includes(step) ? current.skipped : [...current.skipped, step];
  const completed = current.completed.filter((s) => s !== step);
  writeProgress({ completed, skipped });
}

/** Reset all onboarding progress (re-launch the wizard from the admin panel). */
export function relaunchOnboarding(): void {
  writeProgress({ ...INITIAL_PROGRESS });
}

/** Resolve a step's status for rendering. */
export function stepStatus(
  progress: OnboardingProgress,
  step: OnboardingStep
): "done" | "skipped" | "todo" {
  if (progress.completed.includes(step)) return "done";
  if (progress.skipped.includes(step)) return "skipped";
  return "todo";
}

/** True once every step is either completed or skipped. */
export function isOnboardingComplete(progress: OnboardingProgress): boolean {
  return ONBOARDING_STEPS.every(
    (step) => progress.completed.includes(step) || progress.skipped.includes(step)
  );
}
