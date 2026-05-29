"use client";

import * as React from "react";

import {
  applyTheme,
  getStoredTheme,
  getSystemTheme,
  storeTheme,
  type ResolvedTheme,
  type Theme
} from "@/lib/theme";

const THEME_CHANGE_EVENT = "openzigs-theme-change";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

function subscribeTheme(onChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function subscribeSystem(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = React.useSyncExternalStore<Theme>(subscribeTheme, getStoredTheme, () => "system");
  const systemTheme = React.useSyncExternalStore<ResolvedTheme>(
    subscribeSystem,
    getSystemTheme,
    () => "light"
  );

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  // Apply the resolved theme to the DOM (animated via View Transitions)
  // whenever the preference or system scheme changes. This mutates the DOM
  // only — no React state is set here.
  React.useEffect(() => {
    applyTheme(theme);
  }, [theme, systemTheme]);

  const setTheme = React.useCallback((next: Theme) => {
    storeTheme(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    }
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the active theme and setter. Must be used within `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

/** Inline script string applied before paint to avoid a theme FOUC. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('openzigs-theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export { getSystemTheme };
