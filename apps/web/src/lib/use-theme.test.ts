import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { THEME_STORAGE_KEY } from "./theme";
import { useTheme } from "./use-theme";

type MediaListener = () => void;

let systemDark = false;
let mediaListeners: Set<MediaListener>;

function setSystemDark(value: boolean) {
  systemDark = value;
  mediaListeners.forEach((listener) => listener());
}

const isDarkClassSet = () => document.documentElement.classList.contains("dark");

beforeEach(() => {
  systemDark = false;
  mediaListeners = new Set();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return systemDark;
    },
    addEventListener: (_: string, listener: MediaListener) => mediaListeners.add(listener),
    removeEventListener: (_: string, listener: MediaListener) => mediaListeners.delete(listener),
  }));
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useTheme", () => {
  it("未保存なら system で、OS の設定に従ってクラスを付ける", () => {
    systemDark = true;
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("system");
    expect(isDarkClassSet()).toBe(true);
  });

  it("保存済みの値を読み込む", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");
    expect(isDarkClassSet()).toBe(true);
  });

  it("setTheme は localStorage に保存し、クラスを切り替える", () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme("dark"));
    expect(result.current.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(isDarkClassSet()).toBe(true);

    act(() => result.current.setTheme("light"));
    expect(result.current.theme).toBe("light");
    expect(isDarkClassSet()).toBe(false);
  });

  it("system のときだけ OS の設定変更に追従する", () => {
    const { result } = renderHook(() => useTheme());
    expect(isDarkClassSet()).toBe(false);

    act(() => setSystemDark(true));
    expect(isDarkClassSet()).toBe(true);

    act(() => result.current.setTheme("light"));
    act(() => setSystemDark(false));
    act(() => setSystemDark(true));
    expect(isDarkClassSet()).toBe(false);
  });

  it("別タブでの変更を storage イベントで反映する", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    });

    expect(result.current.theme).toBe("dark");
    expect(isDarkClassSet()).toBe(true);
  });

  it("他のキーの storage イベントは無視する", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
    });

    expect(result.current.theme).toBe("system");
    expect(isDarkClassSet()).toBe(false);
  });

  it("localStorage が使えなくても選択をセッション中は保持する", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme("dark"));

    expect(result.current.theme).toBe("dark");
    expect(isDarkClassSet()).toBe(true);
  });
});
