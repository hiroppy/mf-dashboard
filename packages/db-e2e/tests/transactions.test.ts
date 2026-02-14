import { loginWithAuthState } from "@mf-dashboard/crawler/auth/login";
import { hasAuthState } from "@mf-dashboard/crawler/auth/state";
import { createBrowserContext } from "@mf-dashboard/crawler/browser/context";
import { scrapeCashFlowHistory } from "@mf-dashboard/crawler/scrapers/cash-flow-history";
import {
  getAllGroups as getPageGroups,
  switchGroup,
  createGroupScope,
} from "@mf-dashboard/crawler/scrapers/group";
import { getDb, closeDb, getAllGroups as getDbGroups } from "@mf-dashboard/db";
import * as fs from "node:fs";
import * as path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  compareTransactions,
  formatComparisonResult,
  type TransactionComparison,
} from "../src/compare/transactions";

const DEBUG_DIR = path.join(__dirname, "..", "debug");

const MONTHS_TO_SCRAPE = 5;

describe.skip("Transaction比較: スクレイピング vs DB", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    // authStateが存在しない場合はスキップ
    if (!hasAuthState()) {
      throw new Error(
        "auth-state.json が見つかりません。先にcrawlerを実行してログインしてください。",
      );
    }

    browser = await chromium.launch({
      headless: true,
    });

    context = await createBrowserContext(browser, { useAuthState: true });
    page = await context.newPage();
    await loginWithAuthState(page, context);
  });

  afterAll(async () => {
    await page?.close();
    await context?.close();
    await browser?.close();
    closeDb();
  });

  it("全グループの直近5ヶ月のtransactionがDBと一致すること", async () => {
    await using _scope = await createGroupScope(page);

    const db = getDb();

    // ページからグループを取得（グループセレクタがない場合は空配列）
    const pageGroups = await getPageGroups(page);

    // DBからグループを取得
    const dbGroups = await getDbGroups(db);

    if (dbGroups.length === 0) {
      throw new Error("DBにグループが存在しません");
    }

    const allComparisons: TransactionComparison[] = [];
    const failures: string[] = [];

    // グループセレクタがない場合はDBの最初のグループのみを使用
    const hasGroupSelector = pageGroups.length > 0;
    const groupsToTest = hasGroupSelector ? dbGroups : [dbGroups[0]];

    if (!hasGroupSelector) {
      console.log("\nグループセレクタが見つかりません。デフォルトグループでテストを実行します。");
    }

    for (const group of groupsToTest) {
      console.log(`\n--- グループ: ${group.name} ---`);

      // グループセレクタがある場合は切り替え（グループ選択なしも含む）
      if (hasGroupSelector) {
        try {
          await switchGroup(page, group.id);
        } catch (error) {
          console.log(`グループ切り替えに失敗: ${String(error)}`);
          continue;
        }
      }

      // 直近5ヶ月分をスクレイピング（crawlerの関数を使用）
      const cashFlowHistory = await scrapeCashFlowHistory(page, MONTHS_TO_SCRAPE);

      if (cashFlowHistory.length === 0) {
        console.log("取得できたデータがありません");
        continue;
      }

      for (const { month, data } of cashFlowHistory) {
        const comparison = await compareTransactions(month, group.id, group.name, data, db);
        allComparisons.push(comparison);

        const result = formatComparisonResult(comparison);
        console.log(result);

        // 不一致があればfailuresに追加
        if (!comparison.matches.count) {
          failures.push(`${group.name} - ${month} transaction件数: 不一致`);
        }
        if (!comparison.matches.totalIncome) {
          failures.push(`${group.name} - ${month} 収入合計: 不一致`);
        }
        if (!comparison.matches.totalExpense) {
          failures.push(`${group.name} - ${month} 支出合計: 不一致`);
        }
      }
    }

    // 結果サマリー
    const totalChecks = allComparisons.length * 3; // count, income, expense
    const passedChecks = allComparisons.reduce((acc, c) => {
      return (
        acc +
        (c.matches.count ? 1 : 0) +
        (c.matches.totalIncome ? 1 : 0) +
        (c.matches.totalExpense ? 1 : 0)
      );
    }, 0);

    console.log(`\n=== 結果サマリー ===`);
    console.log(`合計チェック数: ${totalChecks}`);
    console.log(`成功: ${passedChecks}`);
    console.log(`失敗: ${totalChecks - passedChecks}`);

    if (failures.length > 0) {
      console.log(`\n不一致項目:`);
      failures.forEach((f) => console.log(`  - ${f}`));
    }

    // データが取得できなかった場合はエラー
    if (allComparisons.length === 0) {
      throw new Error("比較するデータが取得できませんでした");
    }

    // 詳細結果をdebugディレクトリに出力
    const debugOutput = {
      timestamp: new Date().toISOString(),
      summary: {
        totalChecks,
        passedChecks,
        failedChecks: totalChecks - passedChecks,
      },
      comparisons: allComparisons.map((c) => ({
        group: c.groupName,
        month: c.month,
        scraped: c.scraped,
        db: c.db,
        matches: c.matches,
        diff: {
          count: c.scraped.count - c.db.count,
          totalIncome: c.scraped.totalIncome - c.db.totalIncome,
          totalExpense: c.scraped.totalExpense - c.db.totalExpense,
        },
      })),
      failures,
    };
    fs.writeFileSync(
      path.join(DEBUG_DIR, "transactions-comparison.json"),
      JSON.stringify(debugOutput, null, 2),
    );

    // 全て一致していることを確認
    expect(failures).toEqual([]);
  });
});
