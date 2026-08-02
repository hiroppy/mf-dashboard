import { getJstYearMonthKey } from "@mf-dashboard/date-utils";
import type { CashFlowSummary, CashFlowItem } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { debug } from "../logger.js";
import { parseJapaneseNumber } from "../parsers.js";
import {
  SUMMARY_COLUMNS,
  parseDetailRow,
  resolveCashFlowPeriod,
  waitForCashFlowFetchApplied,
} from "./cash-flow-history.js";

export function parseCashFlowMonthHeader(headerText: string | null): string | null {
  const match =
    headerText?.match(/(\d{4})年(\d{1,2})月/) ??
    headerText?.match(/(\d{4})\/(\d{1,2})\/\d{1,2}\s*-/);
  if (!match) return null;

  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return null;

  return `${match[1]}-${String(monthNumber).padStart(2, "0")}`;
}

export function parseCashFlowMonthCsvHref(href: string | null): string | null {
  if (!href) return null;

  const year = href.match(/[?&]year=(\d{4})/)?.[1];
  const monthMatch = href.match(/[?&]month=(\d{1,2})/);
  if (!year || !monthMatch) return null;

  const month = Number(monthMatch[1]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;

  return `${year}-${String(month).padStart(2, "0")}`;
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

export async function getCashFlow(page: Page): Promise<CashFlowSummary> {
  debug("Getting cash flow from /cf page...");

  await page.goto(mfUrls.cashFlow, { waitUntil: "domcontentloaded" });
  // テーブルが表示されるまで待機
  await page.locator("#cf-detail-table").waitFor({ state: "visible", timeout: 10000 });

  const currentMonth = getJstYearMonthKey();
  let displayedState = await getDisplayedCashFlowState(page);
  if (!displayedState) {
    throw new Error("Could not determine the displayed cash flow month");
  }
  let { month } = displayedState;

  // When a previous month is displayed, the service loads the current month's rows
  // asynchronously. Waiting for the full response and month transition prevents treating the
  // previous table as authoritative. Do not click the disabled button on an already
  // current page because empty months legitimately have no CSV link or transaction rows.
  const todayButton = page.locator(".fc-button-today").first();
  if (month !== currentMonth) {
    if (!(await todayButton.isVisible())) {
      throw new Error(`Could not navigate cash flow from ${month} to ${currentMonth}`);
    }

    debug("Clicking today button to navigate to current month");
    await waitForCashFlowFetchApplied(page, async () => {
      const [fetchResponse] = await Promise.all([
        page.waitForResponse(
          (response) => response.url().includes("/cf/fetch") && response.status() === 200,
        ),
        todayButton.click(),
      ]);
      await fetchResponse.finished();
    });
    await page.waitForFunction((expectedMonth) => {
      const headerText = document.querySelector(".fc-header-title h2")?.textContent ?? "";
      const headerMatch =
        headerText.match(/(\d{4})年(\d{1,2})月/) ??
        headerText.match(/(\d{4})\/(\d{1,2})\/\d{1,2}\s*-/);
      const headerMonth = headerMatch
        ? `${headerMatch[1]}-${String(Number(headerMatch[2])).padStart(2, "0")}`
        : null;
      const csvHref = document.querySelector("a[href*='/cf/csv']")?.getAttribute("href") ?? "";
      const csvYear = csvHref.match(/[?&]year=(\d{4})/)?.[1];
      const csvMonthNumber = Number(csvHref.match(/[?&]month=(\d{1,2})/)?.[1]);
      const csvMonth =
        csvYear && csvMonthNumber >= 1 && csvMonthNumber <= 12
          ? `${csvYear}-${String(csvMonthNumber).padStart(2, "0")}`
          : null;

      return csvMonth ? csvMonth === expectedMonth : headerMonth === expectedMonth;
    }, currentMonth);

    displayedState = await getDisplayedCashFlowState(page);
    month = displayedState?.month ?? "";
    if (!displayedState || month !== currentMonth) {
      throw new Error(`Cash flow remained on ${month || "an unknown month"}`);
    }
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
    totalIncome,
    totalExpense,
    balance,
    items,
  };
}
