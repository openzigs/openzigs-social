import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyTheme,
  getStoredTheme,
  getSystemTheme,
  isTheme,
  resolveTheme,
  storeTheme,
  THEME_STORAGE_KEY
} from "./theme";

function mockPrefersDark(matches: boolean): void {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

describe("isTheme", () => {
  it("accepts valid theme tokens", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isTheme("blue")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(42)).toBe(false);
  });
});

describe("getStoredTheme / storeTheme", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to system when nothing stored", () => {
    expect(getStoredTheme()).toBe("system");
  });

  it("round-trips a stored preference", () => {
    storeTheme("dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("ignores a corrupt stored value", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "neon");
    expect(getStoredTheme()).toBe("system");
  });
});

describe("getSystemTheme", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns dark when the OS prefers dark", () => {
    mockPrefersDark(true);
    expect(getSystemTheme()).toBe("dark");
  });

  it("returns light when the OS prefers light", () => {
    mockPrefersDark(false);
    expect(getSystemTheme()).toBe("light");
  });
});

describe("resolveTheme", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes through explicit themes", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves system to the OS preference", () => {
    mockPrefersDark(true);
    expect(resolveTheme("system")).toBe("dark");
  });
});

describe("applyTheme", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove("dark");
    // @ts-expect-error cleanup the optional API
    delete document.startViewTransition;
  });

  it("toggles the dark class via instant fallback when API unavailable", () => {
    const resolved = applyTheme("dark");
    expect(resolved).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("removes the dark class for light", () => {
    document.documentElement.classList.add("dark");
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("uses startViewTransition when available", () => {
    const cb = vi.fn((fn: () => void) => {
      fn();
      return { finished: Promise.resolve() };
    });
    // @ts-expect-error augment for the test
    document.startViewTransition = cb;
    const resolved = applyTheme("dark");
    expect(cb).toHaveBeenCalledTimes(1);
    expect(resolved).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
