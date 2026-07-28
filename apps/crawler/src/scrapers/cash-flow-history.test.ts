import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { buildMonthRange, scrapeCashFlowHistory } from "./cash-flow-history.js";

describe("buildMonthRange", () => {
  test.each([
    ["2023-01", { from: "2023/01/01", to: "2023/01/31" }],
    ["2023-02", { from: "2023/02/01", to: "2023/02/28" }],
    ["2024-02", { from: "2024/02/01", to: "2024/02/29" }],
    ["2023-04", { from: "2023/04/01", to: "2023/04/30" }],
    ["2023-12", { from: "2023/12/01", to: "2023/12/31" }],
  ])("%s の月初/月末範囲を返す", (month, expected) => {
    expect(buildMonthRange(month)).toEqual(expected);
  });
});

describe("scrapeCashFlowHistory", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("前月 navigation の失敗を対象月の callback に通知する", async () => {
    const page = await browser.newPage();
    page.setDefaultTimeout(500);
    try {
      // A read-only E2E cannot safely and deterministically force the service's
      // previous-month navigation to fail, so this failure branch uses minimal HTML.
      await page.route("https://moneyforward.com/cf**", async (route) => {
        await route.fulfill({
          contentType: "text/html",
          body: `
            <a href="/cf/csv?year=2026&month=7">CSV</a>
            <button class="fc-button-prev">前月</button>
            <table id="monthly_total_table_kakeibo"><tbody><tr>
              <td>¥0</td><td></td><td>¥0</td><td></td><td>¥0</td>
            </tr></tbody></table>
            <table id="cf-detail-table"><tbody><tr><td>placeholder</td></tr></tbody></table>
          `,
        });
      });
      const onMonthFailure = vi.fn<(month: string, error: unknown) => void>();

      await expect(scrapeCashFlowHistory(page, 2, { onMonthFailure })).rejects.toThrow(/Timeout/);
      expect(onMonthFailure).toHaveBeenCalledWith("2026-07", expect.any(Error));
    } finally {
      await page.close();
    }
  });
});
