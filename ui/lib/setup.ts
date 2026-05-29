import { API_URL } from "./socket";

/** Providers the minimal wizard supports (mirrors the server enum). */
export type SetupProvider = "openai" | "anthropic" | "openai-compatible";

export const SETUP_PROVIDERS: readonly SetupProvider[] = [
  "openai",
  "anthropic",
  "openai-compatible"
];

/** Human-readable provider labels for the UI. */
export const PROVIDER_LABELS: Record<SetupProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  "openai-compatible": "OpenAI-compatible"
};

/** Total number of wizard steps. */
export const TOTAL_STEPS = 3;

/** localStorage key for persisted wizard progress. */
export const WIZARD_STORAGE_KEY = "ozs.setup.wizard";

/**
 * Persisted wizard state. NOTE: this deliberately stores only progress flags —
 * never the BYOK key or bot token. Secrets live server-side in the vault.
 */
export interface WizardState {
  step: number;
  provider: SetupProvider;
  providerValidated: boolean;
  telegramVerified: boolean;
}

export const INITIAL_WIZARD_STATE: WizardState = {
  step: 0,
  provider: "openai",
  providerValidated: false,
  telegramVerified: false
};

/** Event dispatched when persisted wizard state changes (cross-component sync). */
export const WIZARD_CHANGE_EVENT = "ozs-setup-change";

function clampStep(step: unknown): number {
  if (typeof step !== "number" || Number.isNaN(step)) return 0;
  return Math.min(Math.max(Math.trunc(step), 0), TOTAL_STEPS - 1);
}

function normalizeWizardState(parsed: Partial<WizardState>): WizardState {
  const provider = SETUP_PROVIDERS.includes(parsed.provider as SetupProvider)
    ? (parsed.provider as SetupProvider)
    : INITIAL_WIZARD_STATE.provider;
  return {
    step: clampStep(parsed.step),
    provider,
    providerValidated: Boolean(parsed.providerValidated),
    telegramVerified: Boolean(parsed.telegramVerified)
  };
}

/** Restore persisted wizard state, tolerating absent/corrupt storage. */
export function loadWizardState(): WizardState {
  if (typeof window === "undefined") return { ...INITIAL_WIZARD_STATE };
  try {
    const raw = window.localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return { ...INITIAL_WIZARD_STATE };
    return normalizeWizardState(JSON.parse(raw) as Partial<WizardState>);
  } catch {
    return { ...INITIAL_WIZARD_STATE };
  }
}

// Cached snapshot for useSyncExternalStore — getSnapshot must return a stable
// reference when the underlying storage has not changed, or React loops.
let cachedRaw: string | null = null;
let cachedState: WizardState = INITIAL_WIZARD_STATE;

/** SSR-safe snapshot of persisted wizard state for `useSyncExternalStore`. */
export function getWizardSnapshot(): WizardState {
  if (typeof window === "undefined") return INITIAL_WIZARD_STATE;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(WIZARD_STORAGE_KEY);
  } catch {
    return cachedState;
  }
  if (raw === cachedRaw) return cachedState;
  cachedRaw = raw;
  cachedState = raw
    ? normalizeWizardState(JSON.parse(raw) as Partial<WizardState>)
    : INITIAL_WIZARD_STATE;
  return cachedState;
}

/** Subscribe to persisted wizard changes for `useSyncExternalStore`. */
export function subscribeWizard(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(WIZARD_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(WIZARD_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Persist wizard state. Silently no-ops when storage is unavailable. */
export function saveWizardState(state: WizardState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota / private-mode errors — persistence is best-effort.
  }
}

/** Persist wizard state and notify subscribers. */
export function writeWizardState(state: WizardState): void {
  saveWizardState(state);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(WIZARD_CHANGE_EVENT));
  }
}

/** Clear persisted wizard state (called when the wizard completes). */
export function clearWizardState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    // Ignore.
  }
  window.dispatchEvent(new Event(WIZARD_CHANGE_EVENT));
}

export interface ValidateKeyInput {
  provider: SetupProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface ValidateKeyResult {
  valid: boolean;
  provider?: SetupProvider;
  stored?: boolean;
  reason?: string;
  error?: string;
}

export interface VerifyTelegramInput {
  botToken: string;
  adminChatId: string;
}

export interface VerifyTelegramResult {
  valid: boolean;
  stored?: boolean;
  botUsername?: string;
  reason?: string;
  error?: string;
}

export interface SetupStatus {
  complete: boolean;
  hasProvider: boolean;
  hasTelegram: boolean;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return (await res.json()) as T;
}

/** Validate a BYOK key server-side (which also stores it in the vault). */
export function validateProviderKey(input: ValidateKeyInput): Promise<ValidateKeyResult> {
  return postJson<ValidateKeyResult>("/api/setup/validate-key", input);
}

/** Verify a Telegram bot token + admin chat id server-side. */
export function verifyTelegram(input: VerifyTelegramInput): Promise<VerifyTelegramResult> {
  return postJson<VerifyTelegramResult>("/api/setup/telegram/verify", input);
}

/** Fetch wizard completion status from the server. */
export async function fetchSetupStatus(): Promise<SetupStatus> {
  const res = await fetch(`${API_URL}/api/setup/status`);
  return (await res.json()) as SetupStatus;
}
