import { getJstTodayIsoDate } from "@mf-dashboard/date-utils";
import type { CashFlowSummary, CashFlowItem } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { debug } from "../logger.js";
import { parseJapaneseNumber } from "../parsers.js";
import {
  SUMMARY_COLUMNS,
  parseCashFlowMonthCsvHref,
  parseCashFlowMonthHeader,
  parseDetailRow,
  resolveCashFlowPeriod,
  waitForCashFlowFetchApplied,
} from "./cash-flow-history.js";

export { parseCashFlowMonthCsvHref, parseCashFlowMonthHeader };

async function getRequiredText(locator: ReturnType<Page["locator"]>): Promise<string> {
  try {
    return (await locator.textContent({ timeout: 3000 }))?.trim() ?? "";
  } catch {
    throw new Error("Could not verify the complete cash flow summary");
  }
}

async function getDisplayedCashFlowState(
  page: Page,
): Promise<{ month: string; periodStart: string; periodEnd: string } | null> {
  const monthHeader = page.locator(".fc-header-title h2").first();
  const csvLink = page.locator("a[href*='/cf/csv']").first();
  const [hasMonthHeader, hasCsvLink] = await Promise.all([
    monthHeader.count().then((count) => count > 0),
    csvLink.count().then((count) => count > 0),
  ]);
  const [headerText, csvHref] = await Promise.all([
    hasMonthHeader ? monthHeader.textContent({ timeout: 3000 }).catch(() => null) : null,
    hasCsvLink ? csvLink.getAttribute("href", { timeout: 3000 }).catch(() => null) : null,
  ]);

  const month = parseCashFlowMonthCsvHref(csvHref) ?? parseCashFlowMonthHeader(headerText);
  return month ? { month, ...resolveCashFlowPeriod(headerText, month) } : null;
}

export function isCurrentAccountingPeriod(
  period: { periodStart: string; periodEnd: string },
  today = getJstTodayIsoDate(),
): boolean {
  return period.periodStart <= today && today <= period.periodEnd;
}

export async function ensureCurrentCashFlowView(
  page: Page,
): Promise<{ month: string; periodStart: string; periodEnd: string }> {
  let displayedState = await getDisplayedCashFlowState(page);
  if (!displayedState) {
    throw new Error("Could not determine the displayed cash flow month");
  }

  if (isCurrentAccountingPeriod(displayedState)) return displayedState;

  const todayButton = page.locator(".fc-button-today").first();
  await todayButton.waitFor({ state: "visible", timeout: 3000 }).catch(() => undefined);
  if (!(await todayButton.isVisible())) {
    throw new Error(`Could not navigate cash flow from ${displayedState.month} to today`);
  }

  debug("Clicking today button to navigate to the current accounting period");
  await waitForCashFlowFetchApplied(page, async () => {
    const [fetchResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/cf/fetch") && response.status() === 200,
      ),
      todayButton.click(),
    ]);
    const responseFailure = await fetchResponse.finished();
    if (responseFailure) throw responseFailure;
  });
  displayedState = await getDisplayedCashFlowState(page);
  if (!displayedState || !isCurrentAccountingPeriod(displayedState)) {
    throw new Error("Cash flow did not return to the current accounting period");
  }
  return displayedState;
}

export async function getCashFlow(page: Page): Promise<CashFlowSummary> {
  debug("Getting cash flow from /cf page...");

  await page.goto(mfUrls.cashFlow, { waitUntil: "domcontentloaded" });
  // テーブルが表示されるまで待機
  await page.locator("#cf-detail-table").waitFor({ state: "visible", timeout: 10000 });

  const displayedState = await ensureCurrentCashFlowView(page);
  const { month } = displayedState;

  // Get totals from summary table (並列取得)
  const summaryRow = page.locator("#monthly_total_table_kakeibo tbody tr").first();
  const summaryCells = summaryRow.locator("td");

  const [incomeText, expenseText, balanceText] = await Promise.all([
    getRequiredText(summaryCells.nth(SUMMARY_COLUMNS.INCOME)),
    getRequiredText(summaryCells.nth(SUMMARY_COLUMNS.EXPENSE)),
    getRequiredText(summaryCells.nth(SUMMARY_COLUMNS.BALANCE)),
  ]);

  const totalIncome = parseJapaneseNumber(incomeText || "0");
  const totalExpense = parseJapaneseNumber(expenseText || "0");
  const balance = parseJapaneseNumber(balanceText || "0");

  debug(`Detected month: ${month}`);

  const currentYear = parseInt(month.substring(0, 4), 10);

  // Parse detail items
  const detailRows = page.locator("#cf-detail-table tbody > tr");
  const detailCount = await detailRows.count();
  const items: CashFlowItem[] = [];

  for (let i = 0; i < detailCount; i++) {
    items.push(
      await parseDetailRow(detailRows.nth(i), currentYear, {
        periodStart: displayedState.periodStart,
        periodEnd: displayedState.periodEnd,
      }),
    );
  }

  return {
    month,
    periodStart: displayedState.periodStart,
    periodEnd: displayedState.periodEnd,
    isComplete: true,
    totalIncome,
    totalExpense,
    balance,
    items,
  };
}
