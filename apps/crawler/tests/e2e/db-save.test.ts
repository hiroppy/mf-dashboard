import path from "node:path";
import { getDb, schema } from "@mf-dashboard/db";
import {
  normalizePortfolioCategories,
  saveScrapedData,
} from "@mf-dashboard/db/repository/save-scraped-data";
import type { ScrapedData } from "@mf-dashboard/db/types";
import { eq } from "drizzle-orm";
import type { Browser, BrowserContext } from "playwright";
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { runInstitutionCategoryPhase } from "../../src/crawler-phases.js";
import { scrape } from "../../src/scraper.js";
import {
  gotoHome,
  launchLoggedInContext,
  saveScreenshot,
  setupTestDb,
  cleanupTestDb,
  withErrorScreenshot,
  withNewPage,
} from "./helpers.js";

const TEST_DB_DIR = path.resolve(process.cwd(), "tests/e2e");
const TEST_DB_PATH = path.join(TEST_DB_DIR, "test-moneyforward.db");

let browser: Browser;
let context: BrowserContext;
let scrapedData: ScrapedData;
let normalizedPortfolio: ScrapedData["portfolio"];

beforeAll(async () => {
  // テスト用 DB パスを環境変数で設定
  await setupTestDb(TEST_DB_PATH);

  // auth state を使ってブラウザ起動 & スクレイプ
  ({ browser, context } = await launchLoggedInContext());
  await withNewPage(context, async (page) => {
    await gotoHome(page);
    await saveScreenshot(page, "db-save-test-before-scrape.png");

    scrapedData = await withErrorScreenshot(page, "db-save-test-error.png", () =>
      scrape(page, { skipRefresh: true }),
    );
    const institutionCategories = await runInstitutionCategoryPhase(page);
    normalizedPortfolio = normalizePortfolioCategories(
      scrapedData.portfolio,
      scrapedData.registeredAccounts,
      institutionCategories,
    );
    await saveScrapedData(getDb(), scrapedData, institutionCategories);
  });
});

afterAll(async () => {
  await context?.close();
  await browser?.close();
  // テスト後にクリーンアップ
  cleanupTestDb(TEST_DB_PATH);
});

describe("DB保存", () => {
  test("グループが保存される", async () => {
    const db = getDb();
    const groups = await db.select().from(schema.groups).all();
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.some((g) => g.isCurrent)).toBe(true);
  });

  test("口座が保存される", async () => {
    const db = getDb();
    const accounts = await db.select().from(schema.accounts).all();
    expect(accounts.length).toBeGreaterThan(0);
  });

  test("資産カテゴリが保存される", async () => {
    const db = getDb();
    const categories = await db.select().from(schema.assetCategories).all();
    expect(categories.length).toBeGreaterThan(0);
  });

  test("日次スナップショットが保存される", async () => {
    const db = getDb();
    const snapshots = await db.select().from(schema.dailySnapshots).all();
    expect(snapshots.length).toBeGreaterThan(0);
    const latestSnapshot = snapshots[snapshots.length - 1];
    const today = new Date().toISOString().split("T")[0];
    expect(latestSnapshot.date).toBe(today);
  });

  test("取得したポートフォリオが値を欠落させず保存される", async () => {
    const db = getDb();
    const snapshots = await db.select().from(schema.dailySnapshots).all();
    const latestSnapshot = snapshots[snapshots.length - 1];
    const holdingValues = await db
      .select()
      .from(schema.holdingValues)
      .innerJoin(schema.holdings, eq(schema.holdings.id, schema.holdingValues.holdingId))
      .innerJoin(schema.assetCategories, eq(schema.assetCategories.id, schema.holdings.categoryId))
      .where(eq(schema.holdingValues.snapshotId, latestSnapshot.id))
      .all();

    const expected = normalizedPortfolio.items
      .map((item) => ({
        name: item.name,
        category: item.type,
        amount: Number.isFinite(item.balance) ? item.balance : 0,
        quantity: item.quantity ?? null,
        unitPrice: item.unitPrice ?? null,
        avgCostPrice: item.avgCostPrice ?? null,
        dailyChange: item.dailyChange ?? null,
        unrealizedGain: item.unrealizedGain ?? null,
        unrealizedGainPct: item.unrealizedGainPct ?? null,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const actual = holdingValues
      .filter(({ holdings }) => holdings.type === "asset")
      .map(({ holdings, holding_values: value, asset_categories: category }) => ({
        name: holdings.name,
        category: category.name,
        amount: value.amount,
        quantity: value.quantity,
        unitPrice: value.unitPrice,
        avgCostPrice: value.avgCostPrice,
        dailyChange: value.dailyChange,
        unrealizedGain: value.unrealizedGain,
        unrealizedGainPct: value.unrealizedGainPct,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

    expect(actual).toEqual(expected);
  });

  test("口座ステータスが保存される", async () => {
    const db = getDb();
    const accountStatuses = await db.select().from(schema.accountStatuses).all();
    expect(accountStatuses.length).toBeGreaterThan(0);
  });

  // Note: monthly_summary, yearly_summary, and monthly_category_totals are now calculated dynamically from transactions

  test("取得した有効なトランザクションが重複なく保存される", async () => {
    const db = getDb();
    const transactions = await db.select().from(schema.transactions).all();
    const expectedMfIds = [
      ...new Set(
        scrapedData.cashFlow.items
          .map((item) => item.mfId)
          .filter((mfId) => mfId && !mfId.startsWith("unknown")),
      ),
    ].sort();
    const actualMfIds = transactions.map((transaction) => transaction.mfId).sort();

    expect(actualMfIds.length).toBe(expectedMfIds.length);
    const actualMfIdSet = new Set(actualMfIds);
    expect(expectedMfIds.every((mfId) => actualMfIdSet.has(mfId))).toBe(true);
  });
});
