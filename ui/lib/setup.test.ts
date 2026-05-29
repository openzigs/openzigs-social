import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  INITIAL_WIZARD_STATE,
  WIZARD_CHANGE_EVENT,
  WIZARD_STORAGE_KEY,
  clearWizardState,
  fetchSetupStatus,
  getWizardSnapshot,
  loadWizardState,
  saveWizardState,
  subscribeWizard,
  validateProviderKey,
  verifyTelegram,
  writeWizardState
} from "./setup";

describe("wizard persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns initial state when nothing stored", () => {
    expect(loadWizardState()).toEqual(INITIAL_WIZARD_STATE);
  });

  it("round-trips a saved state", () => {
    const state = {
      step: 2,
      provider: "anthropic" as const,
      providerValidated: true,
      telegramVerified: false
    };
    saveWizardState(state);
    expect(loadWizardState()).toEqual(state);
  });

  it("clamps an out-of-range step", () => {
    localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ step: 99 }));
    expect(loadWizardState().step).toBe(2);
  });

  it("falls back to step 0 for a non-numeric step", () => {
    localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ step: "nope" }));
    expect(loadWizardState().step).toBe(0);
  });

  it("ignores an unknown provider value", () => {
    localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ provider: "evil" }));
    expect(loadWizardState().provider).toBe(INITIAL_WIZARD_STATE.provider);
  });

  it("recovers from corrupt JSON", () => {
    localStorage.setItem(WIZARD_STORAGE_KEY, "{not json");
    expect(loadWizardState()).toEqual(INITIAL_WIZARD_STATE);
  });

  it("clears persisted state", () => {
    saveWizardState({ ...INITIAL_WIZARD_STATE, step: 1 });
    clearWizardState();
    expect(localStorage.getItem(WIZARD_STORAGE_KEY)).toBeNull();
  });

  it("save survives localStorage throwing", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveWizardState(INITIAL_WIZARD_STATE)).not.toThrow();
    spy.mockRestore();
  });

  it("clear survives localStorage throwing", () => {
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => clearWizardState()).not.toThrow();
    spy.mockRestore();
  });
});

describe("wizard external store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("snapshot reflects written state and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWizard(listener);
    writeWizardState({ ...INITIAL_WIZARD_STATE, step: 1, providerValidated: true });
    expect(listener).toHaveBeenCalled();
    expect(getWizardSnapshot()).toMatchObject({ step: 1, providerValidated: true });
    unsubscribe();
  });

  it("returns a stable reference when storage is unchanged", () => {
    writeWizardState({ ...INITIAL_WIZARD_STATE, step: 2 });
    expect(getWizardSnapshot()).toBe(getWizardSnapshot());
  });

  it("notifies subscribers on clear", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWizard(listener);
    clearWizardState();
    expect(listener).toHaveBeenCalledWith(expect.any(Event));
    unsubscribe();
  });

  it("subscribe unsubscribes cleanly", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWizard(listener);
    unsubscribe();
    window.dispatchEvent(new Event(WIZARD_CHANGE_EVENT));
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the key payload and returns the result", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ valid: true, provider: "openai", stored: true }), {
        status: 200
      })
    );
    const result = await validateProviderKey({ provider: "openai", apiKey: "sk-x" });
    expect(result).toEqual({ valid: true, provider: "openai", stored: true });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/api/setup/validate-key");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ provider: "openai", apiKey: "sk-x" }));
  });

  it("posts the telegram payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ valid: true, stored: true, botUsername: "bot" }), {
        status: 200
      })
    );
    const result = await verifyTelegram({ botToken: "t", adminChatId: "1" });
    expect(result.botUsername).toBe("bot");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/setup/telegram/verify");
  });

  it("fetches setup status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ complete: false, hasProvider: true, hasTelegram: false }), {
        status: 200
      })
    );
    const status = await fetchSetupStatus();
    expect(status).toEqual({ complete: false, hasProvider: true, hasTelegram: false });
  });
});
