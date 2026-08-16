import type { Portfolio, PortfolioItem, RegisteredAccounts } from "@mf-dashboard/db/types";
import { ASSET_CATEGORIES } from "@mf-dashboard/meta/categories";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Locator, Page } from "playwright";
import { debug, warn } from "../logger.js";
import { parseDecimalNumber, parseJapaneseNumber, parsePercentage } from "../parsers.js";
import { extractAccountMfIdFromDetailUrl, isExpectedAccountDetailPage } from "./account-detail.js";
import { createManualHoldingKey, type ManualHoldingAccountMap } from "./manual-holding-accounts.js";
import {
  getScheduledWithdrawalStatus,
  type ScheduledWithdrawalStatus,
} from "./scheduled-withdrawals.js";

const DEPOSIT_TABLE_CATEGORIES = new Set(["預金・現金", "暗号資産", "電子マネー・プリペイド"]);
const BOND_CATEGORY = "債券";
const POINT_CATEGORIES = new Set(["ポイント・マイル", "ポイント"]);
const UNKNOWN_CATEGORY = "不明";
const INSURANCE_CATEGORY = "保険";
const PENSION_CATEGORY = "年金";
const LINKED_PNS_CATEGORIES = new Set([INSURANCE_CATEGORY, PENSION_CATEGORY]);
const ASSET_CATEGORY_SET = new Set<string>(ASSET_CATEGORIES);
export const PNS_CORE_COLUMN_COUNT = 6;

// Column indices for each table type
const CELL_TIMEOUT = 1000;

// 預金・現金と債券は「名称・残高・保有金融機関」の同じ3列構造を持つ
const BALANCE_ONLY_COLUMNS = { NAME: 0, BALANCE: 1, INSTITUTION: 2 } as const;
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

async function getAccountMfIdFromCell(cells: Locator, index: number): Promise<string | null> {
  const href = await cells
    .nth(index)
    .locator("a")
    .first()
    .getAttribute("href", { timeout: CELL_TIMEOUT })
    .catch(() => null);
  return href ? extractAccountMfIdFromDetailUrl(href, "show") : null;
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
  return DEPOSIT_TABLE_CATEGORIES.has(category) ? category : "預金・現金";
}

export function parseBalanceOnlyPortfolioItem(
  category: string,
  nameText: string,
  institution: string,
  balanceText: string,
  accountMfId?: string | null,
): PortfolioItem | null {
  const name = nameText.trim();
  if (!name) return null;

  return {
    name,
    type: category,
    institution,
    balance: parseJapaneseNumber(balanceText),
    ...(accountMfId ? { accountMfId } : {}),
  };
}

async function parseBalanceOnlyTable(
  page: Page,
  selector: string,
  resolveCategory: (sectionTitle: string) => string,
): Promise<PortfolioItem[]> {
  const tables = page.locator(selector);
  const tableCount = await tables.count();
  const items: PortfolioItem[] = [];

  for (let t = 0; t < tableCount; t++) {
    const table = tables.nth(t);
    const sectionTitle = await getPrecedingSectionTitle(table);
    const category = resolveCategory(sectionTitle);
    debug(`  ${selector}[${t}] title: "${sectionTitle}" -> ${category}`);

    const rows = table.locator("tbody tr");
    const count = await rows.count();

    for (let i = 0; i < count; i++) {
      const cells = rows.nth(i).locator("td");
      // 並列取得
      const [name, institution, balanceText, accountMfId] = await Promise.all([
        getCellText(cells, BALANCE_ONLY_COLUMNS.NAME),
        getInstitutionFromCell(cells, BALANCE_ONLY_COLUMNS.INSTITUTION),
        getCellText(cells, BALANCE_ONLY_COLUMNS.BALANCE, "0"),
        getAccountMfIdFromCell(cells, BALANCE_ONLY_COLUMNS.INSTITUTION),
      ]);
      const item = parseBalanceOnlyPortfolioItem(
        category,
        name,
        institution,
        balanceText,
        accountMfId,
      );
      if (item) items.push(item);
    }
  }
  return items;
}

// Parse deposits from .table-depo
async function parseDeposits(page: Page): Promise<PortfolioItem[]> {
  return parseBalanceOnlyTable(page, "table.table-depo", resolveDepositTableCategory);
}

// Parse bonds from .table-bd
async function parseBonds(page: Page): Promise<PortfolioItem[]> {
  return parseBalanceOnlyTable(page, "table.table-bd", () => BOND_CATEGORY);
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

export interface LinkedAccountDetailSource {
  complete: boolean;
  fingerprints: readonly string[];
  items: readonly PortfolioItem[];
  scheduledWithdrawals: ReadonlyMap<string, ScheduledWithdrawalStatus>;
}

function normalizePnsCellText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function createLinkedPnsRowFingerprint(
  category: string,
  cellTexts: readonly string[],
): string {
  return JSON.stringify(
    [category, ...cellTexts.slice(0, PNS_CORE_COLUMN_COUNT)].map(normalizePnsCellText),
  );
}

export function hasRequiredPnsColumns(cellTexts: readonly string[]): boolean {
  return cellTexts.length >= PNS_CORE_COLUMN_COUNT;
}

export function haveSamePnsRowMultiset(left: readonly string[], right: readonly string[]): boolean {
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

export function attachManualHoldingReference(
  item: PortfolioItem,
  holdingMfId: string,
  subAccountMfId: string,
  manualHoldingAccountMap: ManualHoldingAccountMap,
): PortfolioItem {
  if (!holdingMfId || !subAccountMfId) return item;

  const accountMfId = manualHoldingAccountMap.get(
    createManualHoldingKey(holdingMfId, subAccountMfId),
  );
  return {
    ...item,
    mfId: holdingMfId,
    subAccountMfId,
    ...(accountMfId ? { accountMfId } : {}),
  };
}

export function selectLinkedPnsAccounts(
  registeredAccounts: RegisteredAccounts,
): RegisteredAccounts["accounts"] {
  return registeredAccounts.accounts.filter(
    (account) =>
      account.type === "自動連携" &&
      extractAccountMfIdFromDetailUrl(account.url, "show") === account.mfId,
  );
}

export function selectLinkedPnsPortfolioItems(
  globalItems: readonly PortfolioItem[],
  globalFingerprints: readonly string[],
  linkedAccountPnsSource?: Pick<LinkedAccountDetailSource, "complete" | "fingerprints" | "items">,
): readonly PortfolioItem[] {
  if (!linkedAccountPnsSource?.complete) return globalItems;
  if (
    globalItems.length !== globalFingerprints.length ||
    linkedAccountPnsSource.items.length !== linkedAccountPnsSource.fingerprints.length
  ) {
    return globalItems;
  }

  const isUnresolvedLinkedItem = (item: PortfolioItem | undefined): boolean =>
    Boolean(item && !item.accountMfId && !(item.mfId && item.subAccountMfId));
  const unresolvedFingerprints = globalFingerprints.filter((_, index) =>
    isUnresolvedLinkedItem(globalItems[index]),
  );
  if (unresolvedFingerprints.length === 0) return globalItems;
  if (!haveSamePnsRowMultiset(unresolvedFingerprints, linkedAccountPnsSource.fingerprints)) {
    return globalItems;
  }

  const detailItemsByFingerprint = new Map<string, PortfolioItem[]>();
  linkedAccountPnsSource.fingerprints.forEach((fingerprint, index) => {
    const item = linkedAccountPnsSource.items[index];
    if (!item) return;
    const items = detailItemsByFingerprint.get(fingerprint) ?? [];
    items.push(item);
    detailItemsByFingerprint.set(fingerprint, items);
  });
  for (const [fingerprint, items] of detailItemsByFingerprint) {
    const accountMfIds = new Set(items.map(({ accountMfId }) => accountMfId));
    if (accountMfIds.size !== 1 || accountMfIds.has(undefined)) {
      detailItemsByFingerprint.delete(fingerprint);
    }
  }

  return globalItems.map((item, index) => {
    if (!isUnresolvedLinkedItem(item)) return item;
    const fingerprint = globalFingerprints[index];
    const candidates = fingerprint ? detailItemsByFingerprint.get(fingerprint) : undefined;
    return candidates?.shift() ?? item;
  });
}

async function getRowCellTexts(row: Locator): Promise<string[]> {
  const cells = row.locator("td");
  const cellCount = await cells.count();
  return Promise.all(Array.from({ length: cellCount }, (_, index) => getCellText(cells, index)));
}

/**
 * 通常の自動連携口座詳細を保険・年金項目の権威ソースとして取得する。
 * 口座との対応は表示名や金額ではなく、検証済みの詳細ページURLで確定する。
 */
export async function getLinkedAccountDetailSource(
  page: Page,
  registeredAccounts: RegisteredAccounts,
): Promise<LinkedAccountDetailSource> {
  const linkedAccounts = selectLinkedPnsAccounts(registeredAccounts);
  const items: PortfolioItem[] = [];
  const fingerprints: string[] = [];
  const scheduledWithdrawals = new Map<string, ScheduledWithdrawalStatus>();
  let failedPageCount = 0;

  for (const account of linkedAccounts) {
    const expectedPath = `/accounts/show/${encodeURIComponent(account.mfId)}`;
    try {
      const response = await page.goto(mfUrls.accountDetail(account.mfId), {
        waitUntil: "domcontentloaded",
      });
      if (!isExpectedAccountDetailPage(response?.ok() === true, page.url(), expectedPath)) {
        failedPageCount++;
        continue;
      }

      const scheduledWithdrawal = await getScheduledWithdrawalStatus(page);
      if (scheduledWithdrawal) scheduledWithdrawals.set(account.mfId, scheduledWithdrawal);

      const tables = page.locator("table.table-pns");
      for (let tableIndex = 0; tableIndex < (await tables.count()); tableIndex++) {
        const table = tables.nth(tableIndex);
        const category = identifyTableTypeFromTitle(await getPrecedingSectionTitle(table));
        if (!LINKED_PNS_CATEGORIES.has(category)) {
          continue;
        }

        const rows = table.locator("tbody tr");
        for (let rowIndex = 0; rowIndex < (await rows.count()); rowIndex++) {
          const cellTexts = await getRowCellTexts(rows.nth(rowIndex));
          if (!hasRequiredPnsColumns(cellTexts)) {
            failedPageCount++;
            continue;
          }
          const item = parsePnsPortfolioItem(category, cellTexts);
          if (!item) {
            failedPageCount++;
            continue;
          }
          items.push({ ...item, accountMfId: account.mfId });
          fingerprints.push(createLinkedPnsRowFingerprint(category, cellTexts));
        }
      }
    } catch {
      failedPageCount++;
    }
  }

  debug(
    `Linked account details: ${items.length} insurance/pension items and ${scheduledWithdrawals.size} scheduled withdrawals from ${linkedAccounts.length} accounts`,
  );
  if (failedPageCount > 0) {
    warn(`Linked account insurance/pension source incomplete: ${failedPageCount} failures`);
  }

  return { complete: failedPageCount === 0, fingerprints, items, scheduledWithdrawals };
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
  if (ASSET_CATEGORY_SET.has(titleText)) {
    return titleText;
  }
  return UNKNOWN_CATEGORY;
}

// Parse insurance, pension, and points from .table-pns
export async function parseInsuranceAndPoints(
  page: Page,
  manualHoldingAccountMap: ManualHoldingAccountMap = new Map(),
  linkedAccountPnsSource?: Pick<LinkedAccountDetailSource, "complete" | "fingerprints" | "items">,
): Promise<PortfolioItem[]> {
  const items: PortfolioItem[] = [];
  const globalLinkedPnsItems: PortfolioItem[] = [];
  const globalLinkedPnsFingerprints: string[] = [];
  const linkedPnsItemIndexes: number[] = [];
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

      const resolvedItem = attachManualHoldingReference(
        item,
        holdingMfId,
        subAccountMfId,
        manualHoldingAccountMap,
      );
      if (LINKED_PNS_CATEGORIES.has(category)) {
        globalLinkedPnsItems.push(resolvedItem);
        globalLinkedPnsFingerprints.push(createLinkedPnsRowFingerprint(category, cellTexts));
        linkedPnsItemIndexes.push(items.length);
      }
      items.push(resolvedItem);
    }
  }

  const selectedLinkedPnsItems = selectLinkedPnsPortfolioItems(
    globalLinkedPnsItems,
    globalLinkedPnsFingerprints,
    linkedAccountPnsSource,
  );
  linkedPnsItemIndexes.forEach((itemIndex, linkedIndex) => {
    const selectedItem = selectedLinkedPnsItems[linkedIndex];
    if (selectedItem) items[itemIndex] = selectedItem;
  });

  if (selectedLinkedPnsItems !== globalLinkedPnsItems) {
    debug(
      `Linked account insurance/pension source applied: ${linkedAccountPnsSource?.items.length ?? 0} items`,
    );
  } else if (linkedAccountPnsSource) {
    warn(
      `Linked account insurance/pension source not applied: global=${globalLinkedPnsItems.length}, detail=${linkedAccountPnsSource.items.length}, complete=${linkedAccountPnsSource.complete}`,
    );
  }
  return items;
}

export async function getPortfolio(
  page: Page,
  manualHoldingAccountMap: ManualHoldingAccountMap = new Map(),
  linkedAccountPnsSource?: Pick<LinkedAccountDetailSource, "complete" | "fingerprints" | "items">,
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

  // 5つのパース関数を並列実行
  const [deposits, stocks, funds, bonds, insuranceAndPoints] = await Promise.all([
    parseDeposits(page),
    parseStocks(page),
    parseFunds(page),
    parseBonds(page),
    parseInsuranceAndPoints(page, manualHoldingAccountMap, linkedAccountPnsSource),
  ]);

  debug(`  .table-depo rows: ${deposits.length}`);
  debug(`  .table-eq rows: ${stocks.length}`);
  debug(`  .table-mf rows: ${funds.length}`);
  debug(`  .table-bd rows: ${bonds.length}`);
  debug(`  .table-pns items: ${insuranceAndPoints.length}`);

  const items: PortfolioItem[] = [
    ...deposits,
    ...stocks,
    ...funds,
    ...bonds,
    ...insuranceAndPoints,
  ];

  if (totalAssets === 0) {
    totalAssets = items.reduce((sum, item) => sum + (item.balance || 0), 0);
    debug(`  Calculated totalAssets from items: ¥${totalAssets.toLocaleString()}`);
  }

  debug(`  Portfolio items: ${items.length}, totalAssets: ¥${totalAssets.toLocaleString()}`);

  return { items, totalAssets };
}
