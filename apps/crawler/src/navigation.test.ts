import type { Page } from "playwright";
import { describe, expect, test, vi } from "vitest";
import { navigateToPage } from "./navigation.js";

function createPage(currentUrl = "about:blank") {
  const goto = vi.fn<(...args: any[]) => any>().mockResolvedValue(null);
  const url = vi.fn<() => string>().mockReturnValue(currentUrl);
  const page = {
    goto,
    isClosed: vi.fn<() => boolean>().mockReturnValue(false),
    url,
  } as unknown as Page;
  return { goto, page, url };
}

describe("navigateToPage", () => {
  test("既に対象URLにいる場合は再遷移しない", async () => {
    const { goto, page } = createPage("https://moneyforward.com/bs/history");
    await navigateToPage(page, "https://moneyforward.com/bs/history");
    expect(goto).not.toHaveBeenCalled();
  });

  test.each(["page.goto: net::ERR_ABORTED", "page.goto: Timeout 30000ms exceeded."])(
    "一時的な遷移エラーを1回だけ再試行する: %s",
    async (message) => {
      const { goto, page } = createPage();
      goto.mockRejectedValueOnce(new Error(message)).mockResolvedValueOnce(null);
      await navigateToPage(page, "https://moneyforward.com/bs/history", { retryDelayMs: 0 });
      expect(goto).toHaveBeenCalledTimes(2);
      expect(goto).toHaveBeenCalledWith(
        "https://moneyforward.com/bs/history",
        expect.objectContaining({ timeout: 60000, waitUntil: "domcontentloaded" }),
      );
    },
  );

  test("中断後に対象URLへ到達済みなら再遷移しない", async () => {
    const { goto, page, url } = createPage();
    goto.mockImplementationOnce(async () => {
      url.mockReturnValue("https://moneyforward.com/bs/history");
      throw new Error("page.goto: net::ERR_ABORTED");
    });
    await navigateToPage(page, "https://moneyforward.com/bs/history", { retryDelayMs: 0 });
    expect(goto).toHaveBeenCalledOnce();
  });

  test("再試行対象外のエラーはそのまま返す", async () => {
    const error = new Error("page.goto: Page crashed");
    const { goto, page } = createPage();
    goto.mockRejectedValue(error);
    await expect(
      navigateToPage(page, "https://moneyforward.com/bs/history", { retryDelayMs: 0 }),
    ).rejects.toBe(error);
    expect(goto).toHaveBeenCalledOnce();
  });
});
