import { mfUrls } from "@mf-dashboard/meta/urls";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
  buildMonthRange,
  parseDetailRow,
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

describe("scrapeCashFlowMonth", () => {
  test("必須セルを取得できない行があれば部分的な月次結果を返さない", async () => {
    const emptyCell = {
      textContent: vi.fn<Locator["textContent"]>().mockResolvedValue(""),
    } as unknown as Locator;
    const cells = {
      nth: vi.fn<(index: number) => Locator>().mockReturnValue(emptyCell),
    } as unknown as Locator;
    const row = {
      getAttribute: vi.fn<Locator["getAttribute"]>().mockResolvedValue(""),
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(cells),
    } as unknown as Locator;

    await expect(parseDetailRow(row, 2026)).rejects.toThrow("Incomplete cash flow transaction row");
  });

  test("取引IDを取得できない行があれば月次置換へ進まない", async () => {
    const texts = new Map([
      [1, "2026/07/01"],
      [2, "Transaction A"],
      [3, "1,000"],
    ]);
    const cells = {
      nth: vi.fn<(index: number) => Locator>((index) => {
        return {
          textContent: vi.fn<Locator["textContent"]>().mockResolvedValue(texts.get(index) ?? ""),
        } as unknown as Locator;
      }),
    } as unknown as Locator;
    const row = {
      getAttribute: vi.fn<Locator["getAttribute"]>().mockResolvedValue(""),
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(cells),
    } as unknown as Locator;

    await expect(parseDetailRow(row, 2026)).rejects.toThrow("Incomplete cash flow transaction row");
  });

  test("指定月範囲へ遷移し、詳細テーブルを待ってから抽出する", async () => {
    const waitFor = vi.fn<Locator["waitFor"]>().mockResolvedValue(undefined);
    const detailTable = { waitFor } as unknown as Locator;
    let csvLink: Locator;
    const csvFirst = vi.fn<() => Locator>();
    csvLink = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(1),
      first: csvFirst,
      getAttribute: vi
        .fn<(name: string) => Promise<string | null>>()
        .mockResolvedValue("/cf/csv?year=2024&month=2"),
    } as unknown as Locator;
    csvFirst.mockReturnValue(csvLink);

    let missing: Locator;
    const missingFirst = vi.fn<() => Locator>();
    missing = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
      first: missingFirst,
    } as unknown as Locator;
    missingFirst.mockReturnValue(missing);

    const amountCell = {
      textContent: vi.fn<() => Promise<string | null>>().mockResolvedValue("0"),
    } as unknown as Locator;
    const summaryCells = {
      nth: vi.fn<(index: number) => Locator>().mockReturnValue(amountCell),
    } as unknown as Locator;
    const summaryRow = {
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(summaryCells),
    } as unknown as Locator;
    const summary = {
      first: vi.fn<() => Locator>().mockReturnValue(summaryRow),
    } as unknown as Locator;
    const detailRows = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
    } as unknown as Locator;

    const goto = vi.fn<Page["goto"]>().mockResolvedValue(null);
    const locator = vi.fn<Page["locator"]>((selector: string) => {
      if (selector === "#cf-detail-table") return detailTable;
      if (selector === "a[href*='/cf/csv']") return csvLink;
      if (selector === "#monthly_total_table_kakeibo tbody tr") return summary;
      if (selector === "#cf-detail-table tbody tr[id^='js-transaction-']") return detailRows;
      return missing;
    });
    const page = { goto, locator } as unknown as Page;

    await expect(scrapeCashFlowMonth(page, "2024-02")).resolves.toEqual({
      month: "2024-02",
      totalIncome: 0,
      totalExpense: 0,
      balance: 0,
      items: [],
    });
    expect(goto).toHaveBeenCalledWith(mfUrls.cashFlowWithRange("2024/02/01", "2024/02/29"), {
      waitUntil: "domcontentloaded",
    });
    expect(waitFor).toHaveBeenCalledWith({ state: "visible", timeout: 10000 });
  });
});
