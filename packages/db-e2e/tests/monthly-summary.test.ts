import { loginWithAuthState } from "@mf-dashboard/crawler/auth/login";
import { hasAuthState } from "@mf-dashboard/crawler/auth/state";
import { createBrowserContext } from "@mf-dashboard/crawler/browser/context";
import { switchGroup, createGroupScope } from "@mf-dashboard/crawler/scrapers/group";
import { scrapeMonthlySummary } from "@mf-dashboard/crawler/scrapers/monthly-summary";
import {
  getDb,
  getMonthlySummaryByMonth,
  getAllGroups as getDbGroups,
  closeDb,
} from "@mf-dashboard/db";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
/**
 * Monthly Summary E2E Test
 *
 * /cf/monthly ページからスクレイピングした月次サマリーと
 * DB から計算した getMonthlySummaryByMonth の結果を比較する
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("Monthly Summary比較: スクレイピング vs DB", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    if (!hasAuthState()) {
      throw new Error(
        "auth-state.json が見つかりません。先にcrawlerを実行してログインしてください。",
      );
    }

    browser = await chromium.launch({ headless: true });
    context = await createBrowserContext(browser, { useAuthState: true });
    page = await context.newPage();
    await loginWithAuthState(page, context);
  }, 60000);

  afterAll(async () => {
    await page?.close();
    await context?.close();
    await browser?.close();
    closeDb();
  });

  it("全グループの月次サマリーがDBと一致すること", async () => {
    await using _scope = await createGroupScope(page);

    const db = getDb();

    // DBからグループを取得
    const dbGroups = await getDbGroups(db);
    if (dbGroups.length === 0) {
      throw new Error("DBにグループが存在しません");
    }

    const failures: string[] = [];
    let totalChecks = 0;

    for (const group of dbGroups) {
      console.log(`\n--- グループ: ${group.name} ---`);

      // グループを切り替え
      await switchGroup(page, group.id);

      // スクレイピングで月次サマリーを取得
      const scrapedSummaries = await scrapeMonthlySummary(page);

      for (const scraped of scrapedSummaries) {
        // DBから同じ月のサマリーを取得
        const dbSummary = await getMonthlySummaryByMonth(scraped.month, group.id, db);
        totalChecks += 2;

        if (!dbSummary) {
          console.log(`⚠ ${scraped.month}: DBにデータなし`);
          failures.push(`${group.name} - ${scraped.month}: DBにデータなし`);
          continue;
        }

        const incomeMatch = scraped.totalIncome === dbSummary.totalIncome;
        const expenseMatch = scraped.totalExpense === dbSummary.totalExpense;

        const incomeStatus = incomeMatch ? "✓" : "✗";
        const expenseStatus = expenseMatch ? "✓" : "✗";

        console.log(
          `${scraped.month}: ` +
            `収入 ${incomeStatus} (スクレイピング: ${scraped.totalIncome.toLocaleString()}, DB: ${dbSummary.totalIncome.toLocaleString()}) ` +
            `支出 ${expenseStatus} (スクレイピング: ${scraped.totalExpense.toLocaleString()}, DB: ${dbSummary.totalExpense.toLocaleString()})`,
        );

        if (!incomeMatch) {
          const diff = scraped.totalIncome - dbSummary.totalIncome;
          failures.push(
            `${group.name} - ${scraped.month} 収入: 不一致 (差額: ${diff.toLocaleString()}円)`,
          );
        }
        if (!expenseMatch) {
          const diff = scraped.totalExpense - dbSummary.totalExpense;
          failures.push(
            `${group.name} - ${scraped.month} 支出: 不一致 (差額: ${diff.toLocaleString()}円)`,
          );
        }
      }
    }

    console.log("\n=== 結果サマリー ===");
    console.log(`合計チェック数: ${totalChecks}`);
    console.log(`成功: ${totalChecks - failures.length}`);
    console.log(`失敗: ${failures.length}`);

    if (failures.length > 0) {
      console.log("\n不一致項目:");
      for (const f of failures) {
        console.log(`  - ${f}`);
      }
    }

    expect(failures).toEqual([]);
  }, 300000);
});
