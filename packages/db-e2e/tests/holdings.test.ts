import { loginWithAuthState } from "@mf-dashboard/crawler/auth/login";
import { hasAuthState } from "@mf-dashboard/crawler/auth/state";
import { createBrowserContext } from "@mf-dashboard/crawler/browser/context";
import {
  getAllGroups as getPageGroups,
  switchGroup,
  createGroupScope,
} from "@mf-dashboard/crawler/scrapers/group";
import { getPortfolio } from "@mf-dashboard/crawler/scrapers/portfolio";
import { getDb, closeDb, getAllGroups as getDbGroups } from "@mf-dashboard/db";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  compareHoldings,
  formatHoldingComparisonResult,
  type HoldingComparison,
} from "../src/compare/holdings";

describe.skip("Holdings比較: スクレイピング vs DB", () => {
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

  it("全グループの保有資産がDBと一致すること", async () => {
    await using _scope = await createGroupScope(page);

    const db = getDb();

    // ページからグループを取得（グループセレクタがない場合は空配列）
    const pageGroups = await getPageGroups(page);

    // DBからグループを取得
    const dbGroups = await getDbGroups(db);

    if (dbGroups.length === 0) {
      throw new Error("DBにグループが存在しません");
    }

    const allComparisons: HoldingComparison[] = [];
    const failures: string[] = [];

    // グループセレクタがない場合はDBの最初のグループのみを使用
    const hasGroupSelector = pageGroups.length > 0;
    const groupsToTest = hasGroupSelector ? dbGroups : [dbGroups[0]];

    if (!hasGroupSelector) {
      console.log("\nグループセレクタが見つかりません。デフォルトグループでテストを実行します。");
    }

    for (const group of groupsToTest) {
      console.log(`\n--- グループ: ${group.name} ---`);

      // グループセレクタがある場合は切り替え
      if (hasGroupSelector) {
        try {
          await switchGroup(page, group.id);
        } catch (error) {
          console.log(`グループ切り替えに失敗: ${String(error)}`);
          continue;
        }
      }

      // ポートフォリオをスクレイピング
      const portfolio = await getPortfolio(page);

      if (portfolio.items.length === 0 && portfolio.totalAssets === 0) {
        console.log("保有資産がありません");
        continue;
      }

      // 比較実行（1000円の誤差を許容 - 株価変動などの影響）
      const comparison = await compareHoldings(group.id, group.name, portfolio, db, 1000);
      allComparisons.push(comparison);

      const result = formatHoldingComparisonResult(comparison);
      console.log(result);

      // 不一致があればfailuresに追加
      if (!comparison.matches.totalAssets) {
        const diff = comparison.scraped.totalAssets - comparison.db.totalAssets;
        failures.push(`${group.name} 総資産: 不一致 (差額: ${diff.toLocaleString()}円)`);
      }
      if (!comparison.matches.itemCount) {
        failures.push(
          `${group.name} 銘柄数: 不一致 (スクレイピング: ${comparison.scraped.itemCount}, DB: ${comparison.db.itemCount})`,
        );
      }

      // 個別銘柄の不一致
      const itemMismatches = comparison.matches.itemMatches.filter((m) => !m.matches);
      if (itemMismatches.length > 0) {
        failures.push(`${group.name} 銘柄不一致: ${itemMismatches.length}件`);
      }
    }

    // 結果サマリー
    const totalChecks = allComparisons.length * 2; // totalAssets, itemCount
    const passedChecks = allComparisons.reduce((acc, c) => {
      return acc + (c.matches.totalAssets ? 1 : 0) + (c.matches.itemCount ? 1 : 0);
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

    // 総資産の一致を確認（銘柄数や個別銘柄は警告のみ）
    const totalAssetFailures = failures.filter((f) => f.includes("総資産"));
    expect(totalAssetFailures).toEqual([]);
  });
});
