import { getJstDateParts } from "@mf-dashboard/date-utils";
import type { CashFlowSummary, CashFlowItem } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Locator, Page } from "playwright";
import { getHistoryMonth } from "../history-months.js";
import { log, debug } from "../logger.js";
import { parseJapaneseNumber, convertDateToIso } from "../parsers.js";
import type { CashFlowHistoryResult } from "../types.js";

// Column indices for #cf-detail-table
// 計算対象 | 日付 | 内容 | 金額 | 保有金融機関 | 大項目 | 中項目 | メモ | 振替 | 削除
const DETAIL_COLUMNS = {
  DATE: 1,
  DESCRIPTION: 2,
  AMOUNT: 3,
  ACCOUNT: 4,
  CATEGORY: 5,
  SUB_CATEGORY: 6,
} as const;

// Column indices for #monthly_total_table_kakeibo
export const SUMMARY_COLUMNS = { INCOME: 0, EXPENSE: 2, BALANCE: 4 } as const;

const TEXT_TIMEOUT = 1000;
const SUMMARY_TIMEOUT = 3000;
const CASH_FLOW_AJAX_STATE = "__mfDashboardCashFlowAjax";
const CASH_FLOW_AMOUNT_PATTERN =
  /^(?:(?:[+\-−▲][¥$]?)|(?:[¥$][+\-−▲]?))?(?:\d{1,3}(?:,\d{3})+|\d+)(?:円)?$/;

export function isSupportedCashFlowAmount(value: string): boolean {
  const normalized = value.replace(/\s/g, "").replace(/\(振替\)$/, "");
  return CASH_FLOW_AMOUNT_PATTERN.test(normalized);
}

export async function waitForCashFlowFetchApplied(
  page: Page,
  navigate: () => Promise<void>,
): Promise<void> {
  await page.evaluate((stateKey) => {
    type AjaxSettings = { url?: string };
    type AjaxHandler = (event: unknown, xhr: unknown, settings: AjaxSettings) => void;
    type JQueryTarget = {
      on: (eventName: string, handler: AjaxHandler) => void;
      off: (eventName: string, handler: AjaxHandler) => void;
    };
    type JQueryFactory = (target: Document) => JQueryTarget;

    const jquery = Reflect.get(window, "jQuery") as JQueryFactory | undefined;
    if (!jquery) throw new Error("Cash flow AJAX lifecycle is unavailable");

    const target = jquery(document);
    const state = { completed: false, target, handler: null as AjaxHandler | null };
    state.handler = (_event, _xhr, settings) => {
      if (settings.url?.includes("/cf/fetch")) {
        state.completed = true;
        target.off("ajaxComplete.mfDashboardCashFlow", state.handler!);
      }
    };
    target.on("ajaxComplete.mfDashboardCashFlow", state.handler);
    Reflect.set(window, stateKey, state);
  }, CASH_FLOW_AJAX_STATE);

  try {
    await navigate();
    await page.waitForFunction(
      (stateKey) => Reflect.get(window, stateKey)?.completed === true,
      CASH_FLOW_AJAX_STATE,
    );
  } finally {
    await page
      .evaluate((stateKey) => {
        const state = Reflect.get(window, stateKey);
        if (state?.handler) {
          state.target.off("ajaxComplete.mfDashboardCashFlow", state.handler);
        }
        Reflect.deleteProperty(window, stateKey);
      }, CASH_FLOW_AJAX_STATE)
      .catch(() => undefined);
  }
}

async function getText(locator: Locator, timeout = TEXT_TIMEOUT): Promise<string> {
  const text = await locator.textContent({ timeout }).catch(() => "");
  return (text ?? "").trim();
}

async function getTextWithFailureSignal(
  locator: Locator,
  timeout = TEXT_TIMEOUT,
): Promise<string | null> {
  try {
    return (await locator.textContent({ timeout }))?.trim() ?? "";
  } catch {
    return null;
  }
}

async function getOptionalText(locator: Locator, timeout = TEXT_TIMEOUT): Promise<string | null> {
  if ((await locator.count()) === 0) return null;
  const text = await locator.first().textContent({ timeout });
  return text?.trim() ?? "";
}

async function getOptionalAttribute(locator: Locator, name: string): Promise<string | null> {
  if ((await locator.count()) === 0) return null;
  return locator.first().getAttribute(name);
}

async function parseAccountCell(
  accountCell: Locator,
): Promise<{ accountFrom?: string; accountTo?: string; hasTransferBox: boolean }> {
  const transferBox = accountCell.locator(".transfer_account_box");
  const hasTransferBox = (await transferBox.count()) > 0;

  if (hasTransferBox) {
    const [fullText, toText] = await Promise.all([getText(accountCell), getText(transferBox)]);
    const accountFrom = fullText.replace(toText, "").trim();
    return {
      hasTransferBox,
      accountFrom: accountFrom || undefined,
      accountTo: toText || undefined,
    };
  }

  const noformSpan = accountCell.locator("div.noform span");
  const hasNoformSpan = (await noformSpan.count()) > 0;
  const accountFrom = hasNoformSpan
    ? await getText(noformSpan.first())
    : await getText(accountCell);

  return {
    hasTransferBox,
    accountFrom: accountFrom || undefined,
    accountTo: undefined,
  };
}

/**
 * ページから表示中の月を検出する
 */
async function detectMonth(page: Page): Promise<{ year: number; month: number }> {
  const today = getJstDateParts();
  let year = today.year;
  let month = today.month;

  // Prefer the CSV period because range headers can start in the previous calendar month.
  const csvLink = await getOptionalAttribute(page.locator("a[href*='/cf/csv']").first(), "href");
  const csvYear = csvLink?.match(/[?&]year=(\d{4})/)?.[1];
  const csvMonth = csvLink?.match(/[?&]month=(\d{1,2})/)?.[1];
  const csvMonthNumber = Number(csvMonth);
  if (csvYear && csvMonth && csvMonthNumber >= 1 && csvMonthNumber <= 12) {
    return { year: Number(csvYear), month: csvMonthNumber };
  }

  // Try 1: fc-header-title (FullCalendar style)
  const headerTitle = await getOptionalText(page.locator(".fc-header-title h2"), SUMMARY_TIMEOUT);
  let match = headerTitle?.match(/(\d{4})年(\d{1,2})月/);

  // Try 2: Look for date display in other formats
  if (!match) {
    const pageText = await getOptionalText(
      page.locator(".heading-small, .month-title, [class*='month']").first(),
    );
    match = pageText?.match(/(\d{4})年(\d{1,2})月/) || pageText?.match(/(\d{4})\/(\d{1,2})/);
  }

  if (match) {
    year = parseInt(match[1]);
    month = parseInt(match[2]);
  }

  return { year, month };
}

/**
 * 金額セルからタイプ（収入/支出/振替）を判定
 */
async function detectTransactionType(
  amountCell: ReturnType<Page["locator"]>,
  categoryText: string,
): Promise<"income" | "expense" | "transfer"> {
  if (categoryText === "") return "transfer";

  // 並列取得
  const [amountClass, amountStyle, amountHtml] = await Promise.all([
    amountCell.getAttribute("class"),
    amountCell.getAttribute("style"),
    amountCell.innerHTML(),
  ]);

  const isIncome =
    (amountClass || "").includes("plus") ||
    (amountClass || "").includes("income") ||
    (amountClass || "").includes("blue") ||
    (amountStyle || "").includes("blue") ||
    (amountHtml || "").includes("plus") ||
    ((amountHtml || "").includes("color") && (amountHtml || "").includes("blue"));

  return isIncome ? "income" : "expense";
}

/**
 * 詳細行から取引データをパース
 */
export async function parseDetailRow(
  row: ReturnType<Page["locator"]>,
  year: number,
): Promise<CashFlowItem> {
  const cells = row.locator("td");

  // グループ1: 基本情報を並列取得
  const [rowId, rowClass, dateText, description, amountText] = await Promise.all([
    row.getAttribute("id").catch(() => ""),
    row.getAttribute("class").catch(() => ""),
    getText(cells.nth(DETAIL_COLUMNS.DATE)),
    getText(cells.nth(DETAIL_COLUMNS.DESCRIPTION)),
    getText(cells.nth(DETAIL_COLUMNS.AMOUNT)),
  ]);

  const mfId = rowId?.startsWith("js-transaction-") ? rowId.slice("js-transaction-".length) : "";
  const date = convertDateToIso(dateText || "", year);
  const parsedDate = new Date(`${date}T00:00:00Z`);
  const isValidDate =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === date;

  // A monthly replacement is safe only when every rendered transaction row was extracted.
  if (!mfId || !isValidDate || !description || !isSupportedCashFlowAmount(amountText)) {
    throw new Error("Incomplete cash flow transaction row");
  }

  // グループ2: カテゴリ情報を並列取得
  const [categoryText, subCategoryText] = await Promise.all([
    getTextWithFailureSignal(cells.nth(DETAIL_COLUMNS.CATEGORY)),
    getTextWithFailureSignal(cells.nth(DETAIL_COLUMNS.SUB_CATEGORY)),
  ]);

  if (categoryText === null || subCategoryText === null) {
    throw new Error("Incomplete cash flow transaction row");
  }

  const { accountFrom, accountTo, hasTransferBox } = await parseAccountCell(
    cells.nth(DETAIL_COLUMNS.ACCOUNT),
  );

  const isExcludedFromCalculation = (rowClass ?? "").includes("mf-grayout");

  const type = await detectTransactionType(cells.nth(DETAIL_COLUMNS.AMOUNT), categoryText);
  const isTransfer = type === "transfer";

  let accountName: string | undefined;
  let transferTarget: string | undefined;

  if (hasTransferBox) {
    // 振替の場合、下段（transfer_account_box）がこのトランザクションの所有者
    // 上段が振替相手先（送金元/送金先）
    accountName = accountTo || undefined;
    transferTarget = accountFrom || undefined;
  } else if (isTransfer && accountFrom && !accountFrom.includes("口座")) {
    transferTarget = accountFrom;
  } else if (accountFrom) {
    accountName = accountFrom;
  }

  return {
    mfId,
    date,
    category: categoryText || null,
    subCategory: subCategoryText || null,
    description,
    amount: Math.abs(parseJapaneseNumber(amountText)),
    type,
    isTransfer,
    isExcludedFromCalculation,
    transferTarget,
    accountName,
  };
}

/**
 * 現在表示中のページから家計簿データを取得
 */
export async function extractCashFlowFromPage(page: Page): Promise<CashFlowSummary> {
  const { year, month: monthNum } = await detectMonth(page);
  const month = `${year}-${String(monthNum).padStart(2, "0")}`;
  debug(`  Extracting data for ${month}...`);

  // Get totals from summary table (並列取得)
  const summaryRow = page.locator("#monthly_total_table_kakeibo tbody tr").first();
  const summaryCells = summaryRow.locator("td");

  const [incomeText, expenseText, balanceText] = await Promise.all([
    getText(summaryCells.nth(SUMMARY_COLUMNS.INCOME), SUMMARY_TIMEOUT),
    getText(summaryCells.nth(SUMMARY_COLUMNS.EXPENSE), SUMMARY_TIMEOUT),
    getText(summaryCells.nth(SUMMARY_COLUMNS.BALANCE), SUMMARY_TIMEOUT),
  ]);

  const totalIncome = parseJapaneseNumber(incomeText || "0");
  const totalExpense = parseJapaneseNumber(expenseText || "0");
  const balance = parseJapaneseNumber(balanceText || "0");

  // Parse detail items
  const detailRows = page.locator("#cf-detail-table tbody > tr");
  const detailCount = await detailRows.count();
  const items: CashFlowItem[] = [];

  for (let i = 0; i < detailCount; i++) {
    items.push(await parseDetailRow(detailRows.nth(i), year));
  }

  return { month, totalIncome, totalExpense, balance, items };
}

export function buildMonthRange(month: string): { from: string; to: string } {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText);
  const lastDay = new Date(year, monthIndex, 0).getDate();

  return {
    from: `${yearText}/${monthText}/01`,
    to: `${yearText}/${monthText}/${String(lastDay).padStart(2, "0")}`,
  };
}

export async function scrapeCashFlowMonth(page: Page, month: string): Promise<CashFlowSummary> {
  const range = buildMonthRange(month);

  await page.goto(mfUrls.cashFlowWithRange(range.from, range.to), {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#cf-detail-table").waitFor({ state: "visible", timeout: 10000 });

  return extractCashFlowFromPage(page);
}

/**
 * CSV linkから現在表示中の月を取得
 */
async function getMonthFromCsvLink(page: Page): Promise<string | null> {
  const csvLink = await getOptionalAttribute(page.locator("a[href*='/cf/csv']").first(), "href");
  const yearMatch = csvLink?.match(/year=(\d{4})/);
  const monthMatch = csvLink?.match(/month=(\d{1,2})/);
  if (yearMatch && monthMatch) {
    return `${yearMatch[1]}-${monthMatch[1].padStart(2, "0")}`;
  }
  return null;
}

/**
 * 過去N月分の家計簿データを取得
 * UIの前月ボタンをクリックして月を切り替えながら取得
 */
export async function scrapeCashFlowHistory(
  page: Page,
  monthsToScrape: number = 12,
  callbacks: {
    onMonthStart?: (month: string) => Promise<void> | void;
    onMonthComplete?: (month: string) => Promise<void> | void;
    onMonthFailure?: (month: string, error: unknown) => Promise<void> | void;
  } = {},
): Promise<CashFlowHistoryResult[]> {
  log(`Scraping cash flow history for ${monthsToScrape} months...`);

  await page.goto(mfUrls.cashFlow, { waitUntil: "domcontentloaded" });
  // テーブルが表示されるまで待機
  await page.locator("#cf-detail-table").waitFor({ state: "visible", timeout: 10000 });

  const results: CashFlowHistoryResult[] = [];

  for (let i = 0; i < monthsToScrape; i++) {
    const targetMonth = (await getMonthFromCsvLink(page)) ?? getHistoryMonth(new Date(), i);
    await callbacks.onMonthStart?.(targetMonth);
    try {
      const data = await extractCashFlowFromPage(page);
      results.push({ month: data.month, progressMonth: targetMonth, data });
      log(`  ${data.month}: ${data.items.length} transactions`);

      if (i < monthsToScrape - 1) {
        const currentMonth = await getMonthFromCsvLink(page);
        const prevButton = page.locator("button.fc-button-prev, span.fc-button-prev").first();

        // 月が変わるまで待機（CSV linkのURLパラメータで判定）
        // クリックで /cf/fetch が発火するため、取りこぼさないよう先にリスナーを登録し、
        // レスポンス到着後にCSV linkの月パラメータが変わったかを確認する
        await waitForCashFlowFetchApplied(page, async () => {
          const [fetchResponse] = await Promise.all([
            page.waitForResponse((res) => res.url().includes("/cf/fetch") && res.status() === 200),
            prevButton.click(),
          ]);
          await fetchResponse.finished();
        });

        // /cf/fetch 後も月が変わらなければ、これ以上データがないことを意味する
        const newMonth = await getMonthFromCsvLink(page);
        if (newMonth === currentMonth) {
          log(`  No more months available after ${currentMonth}, stopping.`);
          await callbacks.onMonthComplete?.(targetMonth);
          break;
        }
      }
      await callbacks.onMonthComplete?.(targetMonth);
    } catch (error) {
      await callbacks.onMonthFailure?.(targetMonth, error);
      throw error;
    }
  }

  return results;
}
