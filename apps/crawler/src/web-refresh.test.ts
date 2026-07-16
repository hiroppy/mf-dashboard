import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { notifyWebRefresh } from "./web-refresh.js";

describe("notifyWebRefresh", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.WEB_URL;
    delete process.env.REFRESH_TOKEN;
    process.env.REFRESH_MAX_ATTEMPTS = "1";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    process.env = originalEnv;
  });

  test("WEB_URL が未設定の場合は refresh をスキップする", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await notifyWebRefresh();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("WEB_URL 設定時に REFRESH_TOKEN が未設定ならエラーにする", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    process.env.WEB_URL = "http://web:8765";

    await expect(notifyWebRefresh()).rejects.toThrow("REFRESH_TOKEN is not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("REFRESH_TOKEN を Bearer 認証ヘッダーとして送信する", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.WEB_URL = "http://web:8765";
    process.env.REFRESH_TOKEN = "refresh-token";

    await notifyWebRefresh();

    expect(fetchMock).toHaveBeenCalledWith("http://web:8765/api/refresh/", {
      method: "POST",
      headers: {
        authorization: "Bearer refresh-token",
      },
      signal: expect.any(AbortSignal),
    });
  });

  test("失敗後に REFRESH_RETRY_DELAY 秒待ってリトライする", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.WEB_URL = "http://web:8765";
    process.env.REFRESH_TOKEN = "refresh-token";
    process.env.REFRESH_MAX_ATTEMPTS = "2";
    process.env.REFRESH_RETRY_DELAY = "2";

    const refreshPromise = notifyWebRefresh();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await refreshPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("最大試行回数まで失敗した場合はエラーにする", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.WEB_URL = "http://web:8765";
    process.env.REFRESH_TOKEN = "refresh-token";
    process.env.REFRESH_MAX_ATTEMPTS = "2";
    process.env.REFRESH_RETRY_DELAY = "0";

    await expect(notifyWebRefresh()).rejects.toThrow(
      "Failed to refresh web cache after 2 attempts",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("REFRESH_MAX_ATTEMPTS が不正な場合はデフォルト回数を使う", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.WEB_URL = "http://web:8765";
    process.env.REFRESH_TOKEN = "refresh-token";
    process.env.REFRESH_MAX_ATTEMPTS = "invalid";
    process.env.REFRESH_RETRY_DELAY = "0";

    await expect(notifyWebRefresh()).rejects.toThrow(
      "Failed to refresh web cache after 12 attempts",
    );
    expect(fetchMock).toHaveBeenCalledTimes(12);
  });

  test("REFRESH_RETRY_DELAY が不正な場合はデフォルト秒数を使う", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.WEB_URL = "http://web:8765";
    process.env.REFRESH_TOKEN = "refresh-token";
    process.env.REFRESH_MAX_ATTEMPTS = "2";
    process.env.REFRESH_RETRY_DELAY = "invalid";

    const refreshPromise = notifyWebRefresh();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await refreshPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
