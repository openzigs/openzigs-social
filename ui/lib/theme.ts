/**
 * Theme persistence + application helpers (#44).
 *
 * The theme swap is animated with the View Transitions API
 * (`document.startViewTransition`) for a smooth cross-fade, falling back to an
 * instant swap when the API is unavailable.
 */
export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "openzigs-theme";

const THEMES: readonly Theme[] = ["system", "light", "dark"];

/** True when the value is one of the supported theme tokens. */
export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Read the persisted theme preference, defaulting to `system`. */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return "system";
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/** Persist the theme preference. */
export function storeTheme(theme: Theme): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures.
  }
}

/** Resolve the OS-level color-scheme preference. */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Collapse a theme preference into the concrete light/dark scheme. */
export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

/** Toggle the `dark` class on the document root for a resolved theme. */
function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

/**
 * Apply a theme to the document, animating the swap via the View Transitions
 * API when supported.
 */
export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);

  if (
    typeof document !== "undefined" &&
    typeof (
      document as Document & {
        startViewTransition?: (cb: () => void) => unknown;
      }
    ).startViewTransition === "function"
  ) {
    (
      document as Document & {
        startViewTransition: (cb: () => void) => unknown;
      }
    ).startViewTransition(() => applyResolvedTheme(resolved));
  } else {
    applyResolvedTheme(resolved);
  }

  return resolved;
}
