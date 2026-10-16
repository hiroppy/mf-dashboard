"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { DARK_MEDIA_QUERY, THEME_STORAGE_KEY, isDark, parseTheme, type Theme } from "./theme";

const listeners = new Set<() => void>();

// localStorage can throw (e.g. blocked storage); keep the choice for the session instead.
let sessionTheme: Theme = "system";

function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return sessionTheme;
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle(
    "dark",
    isDark(theme, matchMedia(DARK_MEDIA_QUERY).matches),
  );
}

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  const media = matchMedia(DARK_MEDIA_QUERY);
  const onSystemChange = () => {
    if (readTheme() === "system") applyTheme("system");
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    applyTheme(readTheme());
    notify();
  };

  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

function setTheme(theme: Theme) {
  sessionTheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
  applyTheme(theme);
  notify();
}

export function useTheme() {
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => "system");

  // Strict Mode's dev-only remount clears the class that themeInitScript set on <html>.
  useLayoutEffect(() => {
    applyTheme(readTheme());
  }, []);

  return { theme, setTheme };
}
