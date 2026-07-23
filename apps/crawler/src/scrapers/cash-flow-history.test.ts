import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
  buildMonthRange,
  scrapeCashFlowHistory,
  scrapeCashFlowMonth,
} from "./cash-flow-history.js";

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

describe("scrapeCashFlowMonth", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("指定月範囲のURLへ遷移して収支テーブル表示後に抽出する", async () => {
    page = await browser.newPage();
    try {
      let requestedUrl: string | null = null;
      await page.route("https://moneyforward.com/cf?**", async (route) => {
        requestedUrl = route.request().url();
        await route.fulfill({
          contentType: "text/html",
          body: `
<!DOCTYPE html>
<html>
  <body>
    <a href="/cf/csv?year=2024&month=2">CSV</a>
    <table id="monthly_total_table_kakeibo">
      <tbody>
        <tr>
          <td>¥0</td>
          <td></td>
          <td>¥0</td>
          <td></td>
          <td>¥0</td>
        </tr>
      </tbody>
    </table>
    <table id="cf-detail-table">
      <tbody><tr><td>placeholder</td></tr></tbody>
    </table>
  </body>
</html>
        `,
        });
      });

      const result = await scrapeCashFlowMonth(page, "2024-02");

      expect(requestedUrl).not.toBeNull();
      expect(requestedUrl).toContain("from=2024%2F02%2F01");
      expect(requestedUrl).toContain("to=2024%2F02%2F29");
      expect(result).toEqual({
        month: "2024-02",
        totalIncome: 0,
        totalExpense: 0,
        balance: 0,
        items: [],
      });
    } finally {
      await page.close();
    }
  });

  test("前月 navigation の失敗を対象月の callback に通知する", async () => {
    page = await browser.newPage();
    page.setDefaultTimeout(50);
    try {
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
