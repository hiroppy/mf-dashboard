import type { Portfolio, PortfolioItem } from "@moneyforward-daily-action/db/types";
import type { Locator, Page } from "playwright";
import { ASSET_CATEGORIES } from "@moneyforward-daily-action/meta/categories";
import { mfUrls } from "@moneyforward-daily-action/meta/urls";
import { debug } from "../logger.js";
import { parseDecimalNumber, parseJapaneseNumber, parsePercentage } from "../parsers.js";

// Asset category constant for points (used for category check in parsing)
const POINT = ASSET_CATEGORIES[5]; // "ポイント・マイル"
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

// Parse deposits from .table-depo
async function parseDeposits(page: Page): Promise<PortfolioItem[]> {
  const rows = page.locator("table.table-depo tbody tr");
  const count = await rows.count();
  const items: PortfolioItem[] = [];

  for (let i = 0; i < count; i++) {
    const cells = rows.nth(i).locator("td");
    // 並列取得
    const [name, institution, balanceText] = await Promise.all([
      getCellText(cells, DEPOSIT_COLUMNS.NAME),
      getInstitutionFromCell(cells, DEPOSIT_COLUMNS.INSTITUTION),
      getCellText(cells, DEPOSIT_COLUMNS.BALANCE, "0"),
    ]);
    if (!name) continue;

    items.push({
      name,
      type: "預金・現金・暗号資産",
      institution,
      balance: parseJapaneseNumber(balanceText),
    });
  }
  return items;
}

// Helper to convert 0 to undefined only for optional numeric fields
function orUndefined(value: number): number | undefined {
  return value || undefined;
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
    if (!name) continue;

    // Parse daily change - keep 0 as valid value (only undefined if empty)
    const dailyChange = dailyChangeText ? parseJapaneseNumber(dailyChangeText) : undefined;

    items.push({
      name,
      code: code || undefined,
      type: "株式(現物)",
      institution,
      balance: parseJapaneseNumber(balanceText),
      quantity: orUndefined(parseDecimalNumber(quantityText)),
      avgCostPrice: orUndefined(parseDecimalNumber(avgCostText)),
      unitPrice: orUndefined(parseDecimalNumber(unitPriceText)),
      dailyChange,
      unrealizedGain: parseJapaneseNumber(unrealizedGainText) || undefined,
      unrealizedGainPct: parsePercentage(unrealizedGainPctText),
    });
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
    if (!name) continue;

    // Parse daily change - keep 0 as valid value (only undefined if empty)
    const dailyChange = dailyChangeText ? parseJapaneseNumber(dailyChangeText) : undefined;

    items.push({
      name,
      type: "投資信託",
      institution,
      balance: parseJapaneseNumber(balanceText),
      quantity: orUndefined(parseDecimalNumber(quantityText)),
      avgCostPrice: orUndefined(parseDecimalNumber(avgCostText)),
      unitPrice: orUndefined(parseDecimalNumber(unitPriceText)),
      dailyChange,
      unrealizedGain: parseJapaneseNumber(unrealizedGainText) || undefined,
      unrealizedGainPct: parsePercentage(unrealizedGainPctText),
    });
  }
  return items;
}

// Get category from section title (h1.heading-normal before the table)
// Returns the title if it's a valid asset category, otherwise returns "不明"
export function identifyTableTypeFromTitle(titleText: string): string {
  // ASSET_CATEGORIES: ["預金・現金・暗号資産", "株式(現物)", "投資信託", "保険", "年金", "ポイント・マイル"]
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

    // Get section title from preceding h1.heading-normal element
    const sectionTitle = await table.evaluate((el) => {
      // Look for h1.heading-normal in preceding siblings
      let prev = el.previousElementSibling;
      while (prev) {
        // Check if this element or its children contain h1.heading-normal
        const h1 = prev.tagName === "H1" ? prev : prev.querySelector("h1.heading-normal");
        if (h1) {
          return h1.textContent?.trim() || "";
        }
        prev = prev.previousElementSibling;
      }
      return "";
    });

    const category = identifyTableTypeFromTitle(sectionTitle);
    debug(`  .table-pns[${t}] title: "${sectionTitle}" -> ${category}`);

    const rows = table.locator("tbody tr");
    const rowCount = await rows.count();

    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator("td");

      if (category === POINT) {
        // 並列取得（ポイント）
        const [name, institution, balanceText] = await Promise.all([
          getCellText(cells, 0),
          getCellText(cells, POINT_COLUMNS.INSTITUTION),
          getCellText(cells, POINT_COLUMNS.BALANCE, "0"),
        ]);
        if (!name) continue;

        items.push({
          name,
          type: category,
          institution,
          balance: parseJapaneseNumber(balanceText),
        });
      } else {
        // 並列取得（保険・年金）
        const [name, balanceText, avgCostText, unrealizedGainText, unrealizedGainPctText] =
          await Promise.all([
            getCellText(cells, 0),
            getCellText(cells, INSURANCE_PENSION_COLUMNS.BALANCE, "0"),
            getCellText(cells, INSURANCE_PENSION_COLUMNS.AVG_COST),
            getCellText(cells, INSURANCE_PENSION_COLUMNS.UNREALIZED_GAIN),
            getCellText(cells, INSURANCE_PENSION_COLUMNS.UNREALIZED_GAIN_PCT),
          ]);
        if (!name) continue;

        // Insurance and Pension share the same 8-column structure
        items.push({
          name,
          type: category,
          institution: "",
          balance: parseJapaneseNumber(balanceText),
          avgCostPrice: orUndefined(parseJapaneseNumber(avgCostText)),
          unrealizedGain: parseJapaneseNumber(unrealizedGainText) || undefined,
          unrealizedGainPct: parsePercentage(unrealizedGainPctText),
        });
      }
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
