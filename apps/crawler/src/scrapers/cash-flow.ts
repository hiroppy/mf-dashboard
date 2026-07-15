import { getJstDateParts, getJstYearMonthKey } from "@mf-dashboard/date-utils";
import type { CashFlowSummary, CashFlowItem } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { debug } from "../logger.js";
import { parseJapaneseNumber } from "../parsers.js";
import { SUMMARY_COLUMNS, parseDetailRow } from "./cash-flow-history.js";

export async function getCashFlow(page: Page): Promise<CashFlowSummary> {
  debug("Getting cash flow from /cf page...");

  await page.goto(mfUrls.cashFlow, { waitUntil: "domcontentloaded" });
  // テーブルが表示されるまで待機
  await page.locator("#cf-detail-table").waitFor({ state: "visible", timeout: 10000 });

  // Click "today" button to ensure we're viewing the current month
  const todayButton = page.locator(".fc-button-today").first();
  if (await todayButton.isVisible()) {
    debug("Clicking today button to navigate to current month");
    await todayButton.click();
    // テーブルの更新を待機
    await page.locator("#cf-detail-table").waitFor({ state: "visible", timeout: 10000 });
  }

  // Get totals from summary table (並列取得)
  const summaryRow = page.locator("#monthly_total_table_kakeibo tbody tr").first();
  const summaryCells = summaryRow.locator("td");

  const [incomeText, expenseText, balanceText] = await Promise.all([
    summaryCells
      .nth(SUMMARY_COLUMNS.INCOME)
      .textContent({ timeout: 3000 })
      .catch(() => "0"),
    summaryCells
      .nth(SUMMARY_COLUMNS.EXPENSE)
      .textContent({ timeout: 3000 })
      .catch(() => "0"),
    summaryCells
      .nth(SUMMARY_COLUMNS.BALANCE)
      .textContent({ timeout: 3000 })
      .catch(() => "0"),
  ]);

  const totalIncome = parseJapaneseNumber(incomeText || "0");
  const totalExpense = parseJapaneseNumber(expenseText || "0");
  const balance = parseJapaneseNumber(balanceText || "0");

  // Get month from page header (format: "2026年2月")
  let month: string | null = null;
  const headerText = await page
    .locator(".fc-header-title h2")
    .textContent()
    .catch(() => null);
  const match = headerText?.match(/(\d{4})年(\d{1,2})月/);
  if (match) {
    month = `${match[1]}-${match[2].padStart(2, "0")}`;
  }

  // Fallback to local date
  if (!month) {
    month = getJstYearMonthKey();
  }

  debug(`Detected month: ${month}`);

  const currentYear = getJstDateParts().year;

  // Parse detail items
  const detailRows = page.locator("#cf-detail-table tbody tr[id^='js-transaction-']");
  const detailCount = await detailRows.count();
  const items: CashFlowItem[] = [];

  for (let i = 0; i < detailCount; i++) {
    const item = await parseDetailRow(detailRows.nth(i), i, currentYear);
    if (item) items.push(item);
  }

  return { month, totalIncome, totalExpense, balance, items };
}
