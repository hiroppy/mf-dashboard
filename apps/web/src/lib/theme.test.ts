import { runInNewContext } from "node:vm";
import { describe, it, expect } from "vitest";
import { isDark, nextTheme, parseTheme, themeInitScript, type Theme } from "./theme";

describe("parseTheme", () => {
  it("light / dark はそのまま返す", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });

  it("未保存や不正な値は system にする", () => {
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("")).toBe("system");
    expect(parseTheme("sepia")).toBe("system");
  });
});

describe("nextTheme", () => {
  it("system → light → dark → system の順に循環する", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });
});

describe("isDark", () => {
  it.each([
    ["system", true, true],
    ["system", false, false],
    ["light", true, false],
    ["light", false, false],
    ["dark", true, true],
    ["dark", false, true],
  ] as const)("theme=%s, OS がダーク=%s のとき %s", (theme, systemPrefersDark, expected) => {
    expect(isDark(theme, systemPrefersDark)).toBe(expected);
  });
});

describe("themeInitScript", () => {
  function runScript(stored: string | null | Error, systemPrefersDark: boolean) {
    const classes = new Set<string>();
    const fakeDocument = {
      documentElement: {
        classList: {
          toggle: (name: string, force: boolean) => {
            if (force) classes.add(name);
            else classes.delete(name);
          },
        },
      },
    };
    const fakeStorage = {
      getItem: () => {
        if (stored instanceof Error) throw stored;
        return stored;
      },
    };
    const fakeMatchMedia = (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && systemPrefersDark,
    });

    runInNewContext(themeInitScript, {
      document: fakeDocument,
      localStorage: fakeStorage,
      matchMedia: fakeMatchMedia,
    });
    return classes.has("dark");
  }

  it.each([
    ["dark", false],
    ["dark", true],
    ["light", false],
    ["light", true],
    [null, false],
    [null, true],
    ["sepia", true],
  ] as const)("保存値=%s, OS がダーク=%s のとき isDark と同じ結果になる", (stored, osDark) => {
    const theme: Theme = stored === "light" || stored === "dark" ? stored : "system";
    expect(runScript(stored, osDark)).toBe(isDark(theme, osDark));
  });

  it("localStorage が使えなくても OS の設定に従う", () => {
    const blocked = new Error("blocked");
    expect(runScript(blocked, true)).toBe(true);
    expect(runScript(blocked, false)).toBe(false);
  });
});
