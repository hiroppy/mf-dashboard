import type { Portfolio, PortfolioItem } from "@mf-dashboard/db/types";
import { ASSET_CATEGORIES } from "@mf-dashboard/meta/categories";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Locator, Page } from "playwright";
import { debug } from "../logger.js";
import { parseDecimalNumber, parseJapaneseNumber, parsePercentage } from "../parsers.js";

const LEGACY_DEPOSIT_CATEGORY = "預金・現金・暗号資産";
const DEPOSIT_TABLE_CATEGORIES = new Set([
  LEGACY_DEPOSIT_CATEGORY,
  "預金・現金",
  "暗号資産",
  "電子マネー・プリペイド",
]);
const POINT_CATEGORIES = new Set(["ポイント・マイル", "ポイント"]);
const UNKNOWN_CATEGORY = "不明";

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
async function parseInsuranceAndPoints(page: Page): Promise<PortfolioItem[]> {
  const items: PortfolioItem[] = [];
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
      const cells = rows.nth(i).locator("td");
      const cellCount = await cells.count();
      const cellTexts = await Promise.all(
        Array.from({ length: cellCount }, (_, index) => getCellText(cells, index)),
      );
      const item = parsePnsPortfolioItem(category, cellTexts);
      if (item) items.push(item);
    }
  }
  return items;
}

export async function getPortfolio(page: Page): Promise<Portfolio> {
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
    parseInsuranceAndPoints(page),
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
