import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDb, schema } from "@mf-dashboard/db";
import { saveScrapedData, saveGroupOnlyData } from "@mf-dashboard/db/repository/save-scraped-data";
import { eq } from "drizzle-orm";
import type { Browser, BrowserContext } from "playwright";
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { createCrawlerProgressReporter } from "../../src/crawler-progress.js";
import { buildScrapedData, buildGroupOnlyScrapedData } from "../../src/data-builder.js";
import type { ScrapeResult } from "../../src/scraper.js";
import { scrapeAllGroups } from "../../src/scraper.js";
import { isNoGroup, createGroupScope } from "../../src/scrapers/group.js";
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
const TEST_DB_PATH = path.join(TEST_DB_DIR, "test-groups-moneyforward.db");
const PROGRESS_STATE_PATH = path.join(os.tmpdir(), `db-save-groups-${randomUUID()}.json`);

let browser: Browser;
let context: BrowserContext;
let scrapeResult: ScrapeResult;

beforeAll(async () => {
  // テスト用 DB パスを環境変数で設定
  await setupTestDb(TEST_DB_PATH);

  // auth state を使ってブラウザ起動 & スクレイプ
  ({ browser, context } = await launchLoggedInContext());
  scrapeResult = await withNewPage(context, async (page) => {
    await gotoHome(page);
    await saveScreenshot(page, "db-save-groups-test-before-scrape.png");

    return withErrorScreenshot(page, "db-save-groups-test-error.png", async () => {
      await using _scope = await createGroupScope(page);

      const progress = await createCrawlerProgressReporter(PROGRESS_STATE_PATH, {
        id: randomUUID(),
        source: "e2e",
        startedAt: new Date().toISOString(),
      });
      const result = await scrapeAllGroups(page, progress, { skipRefresh: true });

      // 保存処理（index.ts と同じフロー）
      const db = getDb();

      // 「グループ選択なし」のデータを保存
      const noGroupData = result.groupDataList.find((gd) => isNoGroup(gd.group.id));
      if (noGroupData) {
        const scrapedData = buildScrapedData(result.globalData, noGroupData);
        await saveScrapedData(db, scrapedData);
      }

      // 各グループはグループ固有データのみ保存
      for (const groupData of result.groupDataList) {
        if (isNoGroup(groupData.group.id)) continue;
        const scrapedData = buildGroupOnlyScrapedData(groupData);
        await saveGroupOnlyData(db, scrapedData);
      }

      return result;
    });
  });
}, 300000);

afterAll(async () => {
  await context?.close();
  await browser?.close();
  // テスト後にクリーンアップ
  cleanupTestDb(TEST_DB_PATH);
  await rm(PROGRESS_STATE_PATH, { force: true });
});

describe("グループ保存（新フロー）", () => {
  test("全グループが保存される", async () => {
    const db = getDb();
    const groups = await db.select().from(schema.groups).all();
    expect(groups.length).toBe(scrapeResult.groupDataList.length);
  });

  test("正確に1つのグループがisCurrentである", async () => {
    const db = getDb();
    const groups = await db.select().from(schema.groups).all();
    const currentGroups = groups.filter((g) => g.isCurrent);
    expect(currentGroups).toHaveLength(1);
  });

  test("isCurrentのグループはdefaultGroupと一致する", async () => {
    if (!scrapeResult.defaultGroup) return;

    const db = getDb();
    const currentGroup = await db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.isCurrent, true))
      .get();

    expect(currentGroup?.id).toBe(scrapeResult.defaultGroup.id);
  });
});

describe("グループ-アカウント紐付け", () => {
  test("各グループにアカウントが紐付けられる", async () => {
    const db = getDb();
    const groupAccounts = await db.select().from(schema.groupAccounts).all();
    expect(groupAccounts.length).toBeGreaterThan(0);
  });

  test("「グループ選択なし」に全アカウントが紐付けられる", async () => {
    const db = getDb();
    const noGroupId = "0";
    const noGroupAccounts = await db
      .select()
      .from(schema.groupAccounts)
      .where(eq(schema.groupAccounts.groupId, noGroupId))
      .all();

    const allAccounts = await db.select().from(schema.accounts).all();
    // unknownアカウントを除外した数と比較
    const realAccounts = allAccounts.filter((a) => a.mfId !== "unknown");
    expect(noGroupAccounts.length).toBe(realAccounts.length);
  });

  test("各グループのアカウント数が正しい", async () => {
    const db = getDb();

    for (const groupData of scrapeResult.groupDataList) {
      const groupId = groupData.group.id;
      const dbLinks = await db
        .select()
        .from(schema.groupAccounts)
        .where(eq(schema.groupAccounts.groupId, groupId))
        .all();

      const scrapedAccountCount = groupData.registeredAccounts.accounts.length;
      expect(dbLinks.length).toBe(scrapedAccountCount);
    }
  });

  test("同じアカウントが複数グループに紐付けできる", async () => {
    const db = getDb();

    // アカウントIDごとにグループ数をカウント
    const groupAccounts = await db.select().from(schema.groupAccounts).all();
    const accountGroupCount = new Map<number, number>();

    for (const ga of groupAccounts) {
      const count = accountGroupCount.get(ga.accountId) || 0;
      accountGroupCount.set(ga.accountId, count + 1);
    }

    // 少なくとも1つのアカウントが複数グループに属している（グループ選択なし + 実際のグループ）
    const multiGroupAccounts = Array.from(accountGroupCount.values()).filter((count) => count > 1);
    expect(multiGroupAccounts.length).toBeGreaterThan(0);
  });
});

describe("資産履歴（グループ別）", () => {
  test("各グループに資産履歴が保存される", async () => {
    const db = getDb();

    for (const groupData of scrapeResult.groupDataList) {
      const groupId = groupData.group.id;
      const history = await db
        .select()
        .from(schema.assetHistory)
        .where(eq(schema.assetHistory.groupId, groupId))
        .all();

      // assetHistoryのポイントがあるグループはDBにも履歴を持つ
      expect(groupData.assetHistory.points.length === 0 || history.length > 0).toBe(true);
    }
  });
});

describe("予算データ（グループ別）", () => {
  test("予算データがあるグループには保存される", async () => {
    const db = getDb();

    for (const groupData of scrapeResult.groupDataList) {
      if (!groupData.spendingTargets) continue;

      const groupId = groupData.group.id;
      const targets = await db
        .select()
        .from(schema.spendingTargets)
        .where(eq(schema.spendingTargets.groupId, groupId))
        .all();

      expect(targets.length).toBe(groupData.spendingTargets.categories.length);
    }
  });
});
