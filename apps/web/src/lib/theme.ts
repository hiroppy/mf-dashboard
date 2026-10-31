export type Theme = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "theme";
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

const THEME_ORDER: readonly Theme[] = ["system", "light", "dark"];

export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

export function nextTheme(theme: Theme): Theme {
  return THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
}

export function isDark(theme: Theme, systemPrefersDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && systemPrefersDark);
}

// Runs in <head> before first paint; keep the decision identical to isDark().
export const themeInitScript = `(function(){var t=null;try{t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}var d=t==="dark"||(t!=="light"&&matchMedia(${JSON.stringify(DARK_MEDIA_QUERY)}).matches);document.documentElement.classList.toggle("dark",d)})()`;
