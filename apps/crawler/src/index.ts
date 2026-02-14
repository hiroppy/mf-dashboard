import { analyzeFinancialData } from "@mf-dashboard/analytics";
import { initDb, closeDb } from "@mf-dashboard/db";
import { updateAccountCategory, buildAccountIdMap } from "@mf-dashboard/db/repository/accounts";
import { saveScrapedData, saveGroupOnlyData } from "@mf-dashboard/db/repository/save-scraped-data";
import {
  hasTransactionsForMonth,
  saveTransactionsForMonth,
} from "@mf-dashboard/db/repository/transactions";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { loginWithAuthState } from "./auth/login.js";
import { hasAuthState } from "./auth/state.js";
import { createBrowserContext } from "./browser/context.js";
import { buildScrapedData, buildGroupOnlyScrapedData } from "./data-builder.js";
import { runHooks } from "./hooks/runner.js";
import { log, debug, info, error, section, warn } from "./logger.js";
import { scrapeAllGroups } from "./scraper.js";
import { scrapeCashFlowHistory } from "./scrapers/cash-flow-history.js";
import { isNoGroup, switchGroup, NO_GROUP_ID, createGroupScope } from "./scrapers/group.js";
import { scrapeInstitutionCategories } from "./scrapers/institution-categories.js";
import { sendSlackNotification, sendErrorNotification } from "./slack.js";

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, "../../../.env"));
} catch {
  // .env file not found (e.g., CI environment)
}

const isDebug = process.env.DEBUG === "true";
const isHeaded = process.env.HEADED === "true";

async function main() {
  const skipRefresh = process.env.SKIP_REFRESH === "true";
  const authState = hasAuthState() ? "configured" : "none";
  const dbPath =
    process.env.DB_PATH || path.join(import.meta.dirname, "../../../data/moneyforward.db");
  const dbExists = existsSync(dbPath);
  const scrapeMode = process.env.SCRAPE_MODE || (dbExists ? "month" : "history");
  const isHistoryMode = scrapeMode === "history";

  section("Options");
  log(`SKIP_REFRESH:   ${skipRefresh}`);
  log(`SCRAPE_MODE:    ${scrapeMode} (DB exists: ${dbExists})`);
  log(`DEBUG:          ${isDebug}`);
  log(`HEADED:         ${isHeaded}`);
  log(`AUTH_STATE:     ${authState}`);

  section("Setup");
  log("Initializing database");
  const db = initDb();

  const browser = await chromium.launch({
    headless: !isHeaded,
  });

  const context = await createBrowserContext(browser, { useAuthState: true });

  const page = await context.newPage();

  try {
    log("Authenticating...");
    await loginWithAuthState(page, context);

    log("Running hooks...");
    await runHooks(page);

    await using groupScope = await createGroupScope(page);
    const defaultGroup = groupScope.originalGroup;

    // ============================================================
    // Scrape: 全グループのデータを取得
    // ============================================================
    section("Scrape (All Groups)");
    const scrapeResult = await scrapeAllGroups(page, {
      skipRefresh,
    });
    const { globalData, groupDataList } = scrapeResult;

    info(`Scraped ${groupDataList.length} groups`);
    for (const groupData of groupDataList) {
      log(`  - ${groupData.group.name}${isNoGroup(groupData.group.id) ? " (no group)" : ""}`);
    }

    // ============================================================
    // Save: データベースに保存
    // ============================================================

    // 「グループ選択なし」のデータを構築して保存（全アカウント + トランザクション等）
    const noGroupData = groupDataList.find((gd) => isNoGroup(gd.group.id));
    if (noGroupData) {
      section(`Save: ${noGroupData.group.name} (Full)`);
      const scrapedData = buildScrapedData(globalData, noGroupData);
      debug("Scraped data:", JSON.stringify(scrapedData, null, 2));
      await saveScrapedData(db, scrapedData);
    }

    // 各グループはグループ固有データのみ保存（リンク + assetHistory + spendingTargets）
    for (const groupData of groupDataList) {
      if (isNoGroup(groupData.group.id)) continue;

      section(`Save: ${groupData.group.name} (Group Only)`);
      const scrapedData = buildGroupOnlyScrapedData(groupData);
      await saveGroupOnlyData(db, scrapedData);
    }

    // 金融機関カテゴリはデフォルトグループ（または最初のグループ）で一度だけ取得
    log("Scraping institution categories...");
    const categoryMap = await scrapeInstitutionCategories(page);
    log(`Updated ${categoryMap.size} account categories`);
    for (const [mfId, category] of categoryMap.entries()) {
      await updateAccountCategory(db, mfId, category);
    }

    if (isHistoryMode) {
      section("Cash Flow History");

      // accountIdMapを構築（トランザクション保存時のaccount_id設定用）
      const accountIdMap = await buildAccountIdMap(db);

      // 先にDBをチェックしてスキップ可能な月数を計算
      // 今月 + 去年の全月分を取得対象とする
      // 例: 2026年1月 → 2026年1月 + 2025年1月〜12月 = 13ヶ月
      const now = new Date();
      const currentMonthIndex = now.getMonth(); // 0-11
      const maxMonths = currentMonthIndex + 1 + 12; // 今年の経過月数 + 去年12ヶ月

      // DBにない最古の月まで取得
      let monthsToFetch = 1; // 今月は常に取得
      for (let i = 1; i < maxMonths; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        if (!(await hasTransactionsForMonth(db, month))) {
          monthsToFetch = i + 1;
        }
      }

      log(`Fetching ${monthsToFetch} months`);

      // 「グループ選択なし」に切り替えて全金融機関のtransactionsを取得
      // transactionsはgroupIdを持たないため、一度だけ取得すれば良い
      await switchGroup(page, NO_GROUP_ID);

      // UIボタンで月を切り替えながらデータを取得
      const historyResults = await scrapeCashFlowHistory(page, monthsToFetch);

      for (const { month, data: monthData } of historyResults) {
        const savedCount = await saveTransactionsForMonth(db, month, monthData.items, accountIdMap);
        log(`  ${month}: saved ${savedCount} transactions`);
      }
    }

    // 分析実行（計算は常に行う、LLM insightsは環境変数がある場合のみ）
    section("Analytics");
    const analyticsGroups = groupDataList;
    if (analyticsGroups.length > 0) {
      const results = await Promise.all(
        analyticsGroups.map(async (groupData) => {
          info(`Running financial analysis for ${groupData.group.name}...`);
          const report = await analyzeFinancialData(db, groupData.group.id);
          if (report) {
            info(`Analysis completed and saved for ${groupData.group.name}`);
          } else {
            log(`No changes detected, skipped analysis for ${groupData.group.name}`);
          }
          return report;
        }),
      );
      info(
        `Analytics finished: ${results.filter(Boolean).length}/${analyticsGroups.length} groups`,
      );
    } else {
      warn("No group available for analytics");
    }

    // Slack通知はデフォルトグループまたは最初のグループのデータを使用
    section("Notification");
    try {
      // デフォルトグループのデータを探す、なければ最初のグループ
      const notifyGroupData =
        groupDataList.find((gd) => gd.group.id === defaultGroup?.id) || groupDataList[0];

      if (!notifyGroupData) {
        warn("No data available for Slack notification");
      } else {
        // アカウント問題はデフォルトグループのアカウントから取得
        const accountIssues = notifyGroupData.registeredAccounts.accounts
          .filter((a) => a.status === "updating" || a.status === "error")
          .map((a) => ({
            name: a.name,
            status: a.status as "updating" | "error",
            errorMessage: a.errorMessage,
          }));

        const now = new Date();
        const updatedAt = now.toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
        });

        await sendSlackNotification({
          summary: notifyGroupData.summary,
          items: notifyGroupData.items,
          updatedAt,
          groupName: notifyGroupData.group.name,
          accountIssues,
        });
      }
    } catch (err) {
      error("Failed to send Slack notification:", err);
    }

    info("Completed!");
  } catch (err) {
    error("Error occurred:", err);

    // Take screenshot on error for debugging
    if (isDebug) {
      const screenshotPath = `error-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      log(`Screenshot saved to ${screenshotPath}`);
    }

    // Send error notification
    if (err instanceof Error) {
      try {
        await sendErrorNotification(err);
      } catch (err) {
        error("Failed to send error notification:", err);
      }
    }

    process.exit(1);
  } finally {
    await browser.close();
    closeDb();
  }
}

void main();
