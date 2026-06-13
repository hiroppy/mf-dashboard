/**
 * /cf/monthly ページから月次収支サマリーを取得
 * 6ヶ月分のデータを1回のアクセスで取得できる
 */
import type { Page } from "playwright";
import { log, debug } from "../logger.js";
import { parseJapaneseNumber } from "../parsers.js";

export interface MonthlySummaryItem {
  month: string; // YYYY-MM
  totalIncome: number;
  totalExpense: number;
}

export function parseMonthlySummaryMonths(headers: string[]): string[] {
  const months: string[] = [];
  for (let i = 1; i < headers.length; i++) {
    const match = headers[i].trim().match(/^(\d{4})\/(\d{1,2})\/\d{1,2}〜$/);
    if (match) {
      months.push(`${match[1]}-${match[2].padStart(2, "0")}`);
    }
  }
  return months;
}

/**
 * /cf/monthly ページから月次サマリーを取得
 */
export async function scrapeMonthlySummary(page: Page): Promise<MonthlySummaryItem[]> {
  log("Scraping monthly summary from /cf/monthly...");

  await page.goto("https://moneyforward.com/cf/monthly", {
    waitUntil: "domcontentloaded",
  });
  // テーブルが表示されるまで待機
  await page.locator("#monthly_list").waitFor({ state: "visible", timeout: 10000 });

  // ヘッダー行から月を取得
  const headerRow = page.locator("#monthly_list tr").first();
  const headers = await headerRow.locator("th, td").allTextContents();

  // 月を解析（最初のセルは空なのでスキップ）
  const months = parseMonthlySummaryMonths(headers);

  debug(`Found months: ${months.join(", ")}`);

  // 収入合計行を取得
  const incomeRow = page
    .locator("#monthly_list tr")
    .filter({ hasText: /収入合計/ })
    .first();
  const incomeCells = await incomeRow.locator("td").allTextContents();

  // 支出合計行を取得
  const expenseRow = page
    .locator("#monthly_list tr")
    .filter({ hasText: /支出合計/ })
    .first();
  const expenseCells = await expenseRow.locator("td").allTextContents();

  // 結果を構築（最初のセルはラベルなのでスキップ）
  const results: MonthlySummaryItem[] = [];
  for (let i = 0; i < months.length; i++) {
    const income = parseJapaneseNumber(incomeCells[i + 1] || "0");
    const expense = parseJapaneseNumber(expenseCells[i + 1] || "0");
    results.push({
      month: months[i],
      totalIncome: income,
      totalExpense: expense,
    });
    debug(`  ${months[i]}: income=${income.toLocaleString()}, expense=${expense.toLocaleString()}`);
  }

  log(`Scraped ${results.length} months of summary data`);
  return results;
}
