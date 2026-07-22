import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildMonthRange, parseDetailRow, scrapeCashFlowMonth } from "./cash-flow-history.js";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

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
  test("指定月範囲のURLへ遷移して収支テーブル表示後に抽出する", async () => {
    const page = await browser.newPage();
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
});

describe("parseDetailRow", () => {
  test("振替口座がある行はカテゴリ表示があっても振替として扱う", async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <table>
          <tbody>
            <tr id="js-transaction-transfer-1" class="mf-grayout">
              <td></td>
              <td>4/15</td>
              <td>Internal transfer</td>
              <td>-1,200</td>
              <td>
                <div>Account A</div>
                <div class="transfer_account_box">Account B</div>
              </td>
              <td>未分類</td>
              <td>未分類</td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      `);

      const result = await parseDetailRow(page.locator("tr"), 0, 2025);

      expect(result).toMatchObject({
        mfId: "transfer-1",
        type: "transfer",
        isTransfer: true,
        isExcludedFromCalculation: true,
        accountName: "Account B",
        transferTarget: "Account A",
      });
    } finally {
      await page.close();
    }
  });
});
