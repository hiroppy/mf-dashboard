import { getJstTodayIsoDate } from "@mf-dashboard/date-utils";
import type { CashFlowSummary } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Page } from "playwright";
import { debug } from "../logger.js";
import {
  extractCashFlowFromPage,
  parseCashFlowMonthCsvHref,
  parseCashFlowMonthHeader,
  resolveCashFlowPeriod,
  waitForCashFlowFetchApplied,
} from "./cash-flow-history.js";

export { parseCashFlowMonthCsvHref, parseCashFlowMonthHeader };

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
  debug(`Detected month: ${displayedState.month}`);
  return extractCashFlowFromPage(page, displayedState);
}
