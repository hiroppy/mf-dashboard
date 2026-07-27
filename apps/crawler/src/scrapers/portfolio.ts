import type { Portfolio, PortfolioItem, RegisteredAccounts } from "@mf-dashboard/db/types";
import { ASSET_CATEGORIES } from "@mf-dashboard/meta/categories";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Locator, Page } from "playwright";
import { debug, warn } from "../logger.js";
import { parseDecimalNumber, parseJapaneseNumber, parsePercentage } from "../parsers.js";
import { createManualHoldingKey, type ManualHoldingAccountMap } from "./manual-holding-accounts.js";

const LEGACY_DEPOSIT_CATEGORY = "預金・現金・暗号資産";
const DEPOSIT_TABLE_CATEGORIES = new Set([
  LEGACY_DEPOSIT_CATEGORY,
  "預金・現金",
  "暗号資産",
  "電子マネー・プリペイド",
]);
const POINT_CATEGORIES = new Set(["ポイント・マイル", "ポイント"]);
const UNKNOWN_CATEGORY = "不明";
const PENSION_CATEGORY = "年金";
const PENSION_CORE_COLUMN_COUNT = 6;
const LINKED_ACCOUNT_PATH_PATTERN = /^\/accounts\/show\/([^/]+)$/;

// Column indices for each table type
const CELL_TIMEOUT = 1000;

const DEPOSIT_COLUMNS = { NAME: 0, BALANCE: 1, INSTITUTION: 2 } as const;
const STOCK_COLUMNS = {
  CODE: 0,
  NAME: 1,
  QUANTITY: 2,
  AVG_COST: 3,
  UNIT_PRICE: 4,
  BALANCE: 5,
  DAILY_CHANGE: 6,
  UNREALIZED_GAIN: 7,
  UNREALIZED_GAIN_PCT: 8,
  INSTITUTION: 9,
} as const;
const FUND_COLUMNS = {
  NAME: 0,
  QUANTITY: 1,
  AVG_COST: 2,
  UNIT_PRICE: 3,
  BALANCE: 4,
  DAILY_CHANGE: 5,
  UNREALIZED_GAIN: 6,
  UNREALIZED_GAIN_PCT: 7,
  INSTITUTION: 8,
} as const;
// Insurance and Pension share the same 8-column structure
const INSURANCE_PENSION_COLUMNS = {
  NAME: 0,
  AVG_COST: 1,
  BALANCE: 2,
  UNREALIZED_GAIN: 3,
  UNREALIZED_GAIN_PCT: 4,
} as const;
const POINT_COLUMNS = { NAME: 0, BALANCE: 4, INSTITUTION: 6 } as const;

// Helper functions
async function getCellText(cells: Locator, index: number, defaultValue = ""): Promise<string> {
  try {
    const text = await cells.nth(index).textContent({ timeout: CELL_TIMEOUT });
    return text?.trim() || defaultValue;
  } catch {
    return defaultValue;
  }
}

async function getInstitutionFromCell(cells: Locator, index: number): Promise<string> {
  const cell = cells.nth(index);
  const link = cell.locator("a").first();

  try {
    if ((await link.count()) > 0) {
      const text = await link.textContent({ timeout: CELL_TIMEOUT });
      return text?.trim() || "";
    }
    const text = await cell.textContent({ timeout: CELL_TIMEOUT });
    return text?.trim() || "";
  } catch {
    return "";
  }
}

async function getPrecedingSectionTitle(table: Locator): Promise<string> {
  return table.evaluate((el) => {
    let prev = el.previousElementSibling;
    while (prev) {
      const h1 = prev.tagName === "H1" ? prev : prev.querySelector("h1.heading-normal");
      if (h1) {
        return h1.textContent?.trim() || "";
      }
      prev = prev.previousElementSibling;
    }
    return "";
  });
}

export function resolveDepositTableCategory(titleText: string): string {
  const category = titleText.trim();
  return DEPOSIT_TABLE_CATEGORIES.has(category) ? category : LEGACY_DEPOSIT_CATEGORY;
}

export function parseDepositPortfolioItem(
  category: string,
  nameText: string,
  institution: string,
  balanceText: string,
): PortfolioItem | null {
  const name = nameText.trim();
  if (!name) return null;

  return {
    name,
    type: category,
    institution,
    balance: parseJapaneseNumber(balanceText),
  };
}

// Parse deposits from .table-depo
async function parseDeposits(page: Page): Promise<PortfolioItem[]> {
  const tables = page.locator("table.table-depo");
  const tableCount = await tables.count();
  const items: PortfolioItem[] = [];

  for (let t = 0; t < tableCount; t++) {
    const table = tables.nth(t);
    const sectionTitle = await getPrecedingSectionTitle(table);
    const category = resolveDepositTableCategory(sectionTitle);
    debug(`  .table-depo[${t}] title: "${sectionTitle}" -> ${category}`);

    const rows = table.locator("tbody tr");
    const count = await rows.count();

    for (let i = 0; i < count; i++) {
      const cells = rows.nth(i).locator("td");
      // 並列取得
      const [name, institution, balanceText] = await Promise.all([
        getCellText(cells, DEPOSIT_COLUMNS.NAME),
        getInstitutionFromCell(cells, DEPOSIT_COLUMNS.INSTITUTION),
        getCellText(cells, DEPOSIT_COLUMNS.BALANCE, "0"),
      ]);
      const item = parseDepositPortfolioItem(category, name, institution, balanceText);
      if (item) items.push(item);
    }
  }
  return items;
}

// Helper to convert 0 to undefined only for optional numeric fields
function orUndefined(value: number): number | undefined {
  return value || undefined;
}

export function parseOptionalJapaneseNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed || ["-", "−", "—", "–", "―"].includes(trimmed)) {
    return undefined;
  }
  return parseJapaneseNumber(trimmed);
}

type InvestmentPortfolioTexts = {
  name: string;
  institution: string;
  balance: string;
  quantity: string;
  avgCost: string;
  unitPrice: string;
  dailyChange: string;
  unrealizedGain: string;
  unrealizedGainPct: string;
};

function parseInvestmentPortfolioItem(
  type: "株式(現物)" | "投資信託",
  texts: InvestmentPortfolioTexts,
  code?: string,
): PortfolioItem | null {
  const name = texts.name.trim();
  if (!name) return null;

  return {
    name,
    ...(code?.trim() ? { code: code.trim() } : {}),
    type,
    institution: texts.institution.trim(),
    balance: parseJapaneseNumber(texts.balance),
    quantity: orUndefined(parseDecimalNumber(texts.quantity)),
    avgCostPrice: orUndefined(parseDecimalNumber(texts.avgCost)),
    unitPrice: orUndefined(parseDecimalNumber(texts.unitPrice)),
    dailyChange: parseOptionalJapaneseNumber(texts.dailyChange),
    unrealizedGain: parseOptionalJapaneseNumber(texts.unrealizedGain),
    unrealizedGainPct: parsePercentage(texts.unrealizedGainPct),
  };
}

export function parseStockPortfolioItem(
  texts: InvestmentPortfolioTexts & { code: string },
): PortfolioItem | null {
  return parseInvestmentPortfolioItem("株式(現物)", texts, texts.code);
}

export function parseFundPortfolioItem(texts: InvestmentPortfolioTexts): PortfolioItem | null {
  return parseInvestmentPortfolioItem("投資信託", texts);
}

export function isPointCategory(category: string): boolean {
  return POINT_CATEGORIES.has(category);
}

export function parsePnsPortfolioItem(
  category: string,
  cellTexts: readonly string[],
): PortfolioItem | null {
  const name = cellTexts[0]?.trim() ?? "";
  if (!name) return null;

  if (isPointCategory(category)) {
    return {
      name,
      type: category,
      institution: cellTexts[POINT_COLUMNS.INSTITUTION]?.trim() ?? "",
      balance: parseJapaneseNumber(cellTexts[POINT_COLUMNS.BALANCE] ?? "0"),
    };
  }

  return {
    name,
    type: category,
    institution: "",
    balance: parseJapaneseNumber(cellTexts[INSURANCE_PENSION_COLUMNS.BALANCE] ?? "0"),
    avgCostPrice: orUndefined(
      parseJapaneseNumber(cellTexts[INSURANCE_PENSION_COLUMNS.AVG_COST] ?? ""),
    ),
    unrealizedGain: parseOptionalJapaneseNumber(
      cellTexts[INSURANCE_PENSION_COLUMNS.UNREALIZED_GAIN] ?? "",
    ),
    unrealizedGainPct: parsePercentage(
      cellTexts[INSURANCE_PENSION_COLUMNS.UNREALIZED_GAIN_PCT] ?? "",
    ),
  };
}

export interface LinkedAccountPensionSource {
  complete: boolean;
  fingerprints: string[];
  items: PortfolioItem[];
}

function normalizePensionCellText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function createPensionRowFingerprint(cellTexts: readonly string[]): string {
  return JSON.stringify(
    cellTexts.slice(0, PENSION_CORE_COLUMN_COUNT).map(normalizePensionCellText),
  );
}

export function haveSamePensionRowMultiset(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;

  const counts = new Map<string, number>();
  for (const fingerprint of left) {
    counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
  }
  for (const fingerprint of right) {
    const count = counts.get(fingerprint);
    if (!count) return false;
    if (count === 1) {
      counts.delete(fingerprint);
    } else {
      counts.set(fingerprint, count - 1);
    }
  }
  return counts.size === 0;
}

function extractLinkedAccountMfId(href: string): string | null {
  try {
    const pathname = new URL(href, mfUrls.home).pathname;
    const match = pathname.match(LINKED_ACCOUNT_PATH_PATTERN);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

async function getRowCellTexts(row: Locator): Promise<string[]> {
  const cells = row.locator("td");
  const cellCount = await cells.count();
  return Promise.all(Array.from({ length: cellCount }, (_, index) => getCellText(cells, index)));
}

/**
 * 通常の自動連携口座詳細を年金項目の権威ソースとして取得する。
 * 口座との対応は表示名や金額ではなく、検証済みの詳細ページURLで確定する。
 */
export async function getLinkedAccountPensionSource(
  page: Page,
  registeredAccounts: RegisteredAccounts,
): Promise<LinkedAccountPensionSource> {
  const linkedAccounts = registeredAccounts.accounts.filter(
    (account) =>
      account.type === "自動連携" && extractLinkedAccountMfId(account.url) === account.mfId,
  );
  const items: PortfolioItem[] = [];
  const fingerprints: string[] = [];
  let failedPageCount = 0;

  for (const account of linkedAccounts) {
    const expectedPath = `/accounts/show/${encodeURIComponent(account.mfId)}`;
    try {
      const response = await page.goto(mfUrls.accountDetail(account.mfId), {
        waitUntil: "domcontentloaded",
      });
      if (!response?.ok() || new URL(page.url()).pathname !== expectedPath) {
        failedPageCount++;
        continue;
      }

      const tables = page.locator("table.table-pns");
      for (let tableIndex = 0; tableIndex < (await tables.count()); tableIndex++) {
        const table = tables.nth(tableIndex);
        if (
          identifyTableTypeFromTitle(await getPrecedingSectionTitle(table)) !== PENSION_CATEGORY
        ) {
          continue;
        }

        const rows = table.locator("tbody tr");
        for (let rowIndex = 0; rowIndex < (await rows.count()); rowIndex++) {
          const cellTexts = await getRowCellTexts(rows.nth(rowIndex));
          if (cellTexts.length < PENSION_CORE_COLUMN_COUNT) {
            failedPageCount++;
            continue;
          }
          const item = parsePnsPortfolioItem(PENSION_CATEGORY, cellTexts);
          if (!item) {
            failedPageCount++;
            continue;
          }
          items.push({ ...item, accountMfId: account.mfId });
          fingerprints.push(createPensionRowFingerprint(cellTexts));
        }
      }
    } catch {
      failedPageCount++;
    }
  }

  debug(
    `Linked account pension source: ${items.length} items from ${linkedAccounts.length} current accounts`,
  );
  if (failedPageCount > 0) {
    warn(`Linked account pension source incomplete: ${failedPageCount} failures`);
  }

  return { complete: failedPageCount === 0, fingerprints, items };
}

// Parse stocks from .table-eq
async function parseStocks(page: Page): Promise<PortfolioItem[]> {
  const rows = page.locator("table.table-eq tbody tr");
  const count = await rows.count();
  const items: PortfolioItem[] = [];

  for (let i = 0; i < count; i++) {
    const cells = rows.nth(i).locator("td");
    // 並列取得
    const [
      name,
      code,
      institution,
      balanceText,
      quantityText,
      avgCostText,
      unitPriceText,
      dailyChangeText,
      unrealizedGainText,
      unrealizedGainPctText,
    ] = await Promise.all([
      getCellText(cells, STOCK_COLUMNS.NAME),
      getCellText(cells, STOCK_COLUMNS.CODE),
      getInstitutionFromCell(cells, STOCK_COLUMNS.INSTITUTION),
      getCellText(cells, STOCK_COLUMNS.BALANCE, "0"),
      getCellText(cells, STOCK_COLUMNS.QUANTITY),
      getCellText(cells, STOCK_COLUMNS.AVG_COST),
      getCellText(cells, STOCK_COLUMNS.UNIT_PRICE),
      getCellText(cells, STOCK_COLUMNS.DAILY_CHANGE),
      getCellText(cells, STOCK_COLUMNS.UNREALIZED_GAIN),
      getCellText(cells, STOCK_COLUMNS.UNREALIZED_GAIN_PCT),
    ]);
    const item = parseStockPortfolioItem({
      name,
      code,
      institution,
      balance: balanceText,
      quantity: quantityText,
      avgCost: avgCostText,
      unitPrice: unitPriceText,
      dailyChange: dailyChangeText,
      unrealizedGain: unrealizedGainText,
      unrealizedGainPct: unrealizedGainPctText,
    });
    if (item) items.push(item);
  }
  return items;
}

// Parse mutual funds from .table-mf
async function parseFunds(page: Page): Promise<PortfolioItem[]> {
  const rows = page.locator("table.table-mf tbody tr");
  const count = await rows.count();
  const items: PortfolioItem[] = [];

  for (let i = 0; i < count; i++) {
    const cells = rows.nth(i).locator("td");
    // 並列取得
    const [
      name,
      institution,
      balanceText,
      quantityText,
      avgCostText,
      unitPriceText,
      dailyChangeText,
      unrealizedGainText,
      unrealizedGainPctText,
    ] = await Promise.all([
      getCellText(cells, FUND_COLUMNS.NAME),
      getInstitutionFromCell(cells, FUND_COLUMNS.INSTITUTION),
      getCellText(cells, FUND_COLUMNS.BALANCE, "0"),
      getCellText(cells, FUND_COLUMNS.QUANTITY),
      getCellText(cells, FUND_COLUMNS.AVG_COST),
      getCellText(cells, FUND_COLUMNS.UNIT_PRICE),
      getCellText(cells, FUND_COLUMNS.DAILY_CHANGE),
      getCellText(cells, FUND_COLUMNS.UNREALIZED_GAIN),
      getCellText(cells, FUND_COLUMNS.UNREALIZED_GAIN_PCT),
    ]);
    const item = parseFundPortfolioItem({
      name,
      institution,
      balance: balanceText,
      quantity: quantityText,
      avgCost: avgCostText,
      unitPrice: unitPriceText,
      dailyChange: dailyChangeText,
      unrealizedGain: unrealizedGainText,
      unrealizedGainPct: unrealizedGainPctText,
    });
    if (item) items.push(item);
  }
  return items;
}

// Get category from section title (h1.heading-normal before the table)
// Returns the title if it's a valid asset category, otherwise returns "不明"
export function identifyTableTypeFromTitle(titleText: string): string {
  // ASSET_CATEGORIES includes both legacy combined labels and current split labels.
  const validCategories = new Set(ASSET_CATEGORIES);
  if (validCategories.has(titleText as (typeof ASSET_CATEGORIES)[number])) {
    return titleText;
  }
  return UNKNOWN_CATEGORY;
}

// Parse insurance, pension, and points from .table-pns
export async function parseInsuranceAndPoints(
  page: Page,
  manualHoldingAccountMap: ManualHoldingAccountMap = new Map(),
  linkedAccountPensionSource?: LinkedAccountPensionSource,
): Promise<PortfolioItem[]> {
  const items: PortfolioItem[] = [];
  const globalPensionItems: PortfolioItem[] = [];
  const globalPensionFingerprints: string[] = [];
  let pensionInsertionIndex: number | null = null;
  const tables = page.locator("table.table-pns");
  const tableCount = await tables.count();

  for (let t = 0; t < tableCount; t++) {
    const table = tables.nth(t);

    const sectionTitle = await getPrecedingSectionTitle(table);
    const category = identifyTableTypeFromTitle(sectionTitle);
    debug(`  .table-pns[${t}] title: "${sectionTitle}" -> ${category}`);

    const rows = table.locator("tbody tr");
    const rowCount = await rows.count();

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const [cellTexts, holdingMfId, subAccountMfId] = await Promise.all([
        getRowCellTexts(row),
        row
          .locator('input[name="user_asset_det[id]"]')
          .first()
          .inputValue({ timeout: CELL_TIMEOUT })
          .then((value) => value.trim())
          .catch(() => ""),
        row
          .locator('input[name="user_asset_det[sub_account_id_hash]"]')
          .first()
          .inputValue({ timeout: CELL_TIMEOUT })
          .then((value) => value.trim())
          .catch(() => ""),
      ]);
      const item = parsePnsPortfolioItem(category, cellTexts);
      if (!item) continue;

      if (holdingMfId && subAccountMfId) {
        item.mfId = holdingMfId;
        item.subAccountMfId = subAccountMfId;
        const accountMfId = manualHoldingAccountMap.get(
          createManualHoldingKey(holdingMfId, subAccountMfId),
        );
        if (accountMfId) item.accountMfId = accountMfId;
      }
      if (category === PENSION_CATEGORY) {
        pensionInsertionIndex ??= items.length;
        globalPensionItems.push(item);
        globalPensionFingerprints.push(createPensionRowFingerprint(cellTexts));
      } else {
        items.push(item);
      }
    }
  }

  const useLinkedAccountPensions =
    linkedAccountPensionSource?.complete === true &&
    haveSamePensionRowMultiset(globalPensionFingerprints, linkedAccountPensionSource.fingerprints);

  if (useLinkedAccountPensions) {
    items.splice(pensionInsertionIndex ?? items.length, 0, ...linkedAccountPensionSource.items);
    debug(
      `Linked account pension source applied: ${linkedAccountPensionSource.items.length} items`,
    );
  } else {
    items.splice(pensionInsertionIndex ?? items.length, 0, ...globalPensionItems);
    if (linkedAccountPensionSource) {
      warn(
        `Linked account pension source not applied: global=${globalPensionItems.length}, detail=${linkedAccountPensionSource.items.length}, complete=${linkedAccountPensionSource.complete}`,
      );
    }
  }
  return items;
}

export async function getPortfolio(
  page: Page,
  manualHoldingAccountMap: ManualHoldingAccountMap = new Map(),
  linkedAccountPensionSource?: LinkedAccountPensionSource,
): Promise<Portfolio> {
  debug("Getting portfolio from /bs/portfolio page...");

  // Get official totalAssets from bs/history (more accurate than summing items)
  await page.goto(mfUrls.assetHistory, { waitUntil: "domcontentloaded" });
  // テーブルが表示されるまで待機
  await page.locator("table.table-bordered").waitFor({ state: "visible", timeout: 10000 });

  let totalAssets = 0;
  try {
    const firstRow = page.locator("table.table-bordered tbody tr").first();
    const totalText = await firstRow.locator("td").nth(0).textContent({ timeout: 3000 });
    totalAssets = parseJapaneseNumber(totalText || "0");
    debug(`  Official totalAssets from bs/history: ¥${totalAssets.toLocaleString()}`);
  } catch {
    debug("  Failed to get totalAssets from bs/history");
  }

  // Get individual items from bs/portfolio
  await page.goto(mfUrls.portfolio, { waitUntil: "domcontentloaded" });
  // ポートフォリオコンテンツが表示されるまで待機
  await page.locator("h1.heading-normal").first().waitFor({ state: "visible", timeout: 10000 });

  // 4つのパース関数を並列実行
  const [deposits, stocks, funds, insuranceAndPoints] = await Promise.all([
    parseDeposits(page),
    parseStocks(page),
    parseFunds(page),
    parseInsuranceAndPoints(page, manualHoldingAccountMap, linkedAccountPensionSource),
  ]);

  debug(`  .table-depo rows: ${deposits.length}`);
  debug(`  .table-eq rows: ${stocks.length}`);
  debug(`  .table-mf rows: ${funds.length}`);
  debug(`  .table-pns items: ${insuranceAndPoints.length}`);

  const items: PortfolioItem[] = [...deposits, ...stocks, ...funds, ...insuranceAndPoints];

  if (totalAssets === 0) {
    totalAssets = items.reduce((sum, item) => sum + (item.balance || 0), 0);
    debug(`  Calculated totalAssets from items: ¥${totalAssets.toLocaleString()}`);
  }

  debug(`  Portfolio items: ${items.length}, totalAssets: ¥${totalAssets.toLocaleString()}`);

  return { items, totalAssets };
}
