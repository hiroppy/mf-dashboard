import { formatJstDateTimeForDisplay, getJstDateParts } from "@mf-dashboard/date-utils";
import type { Group, ScrapedData } from "@mf-dashboard/db/types";
import type { Page } from "playwright";
import {
  CRAWLER_STEPS,
  normalizeCrawlerError,
  type CrawlerProgressReporter,
} from "./crawler-progress.js";
import { log, warn, phase } from "./logger.js";
import { getAssetHistory } from "./scrapers/asset-history.js";
import { getAssetItems } from "./scrapers/asset-items.js";
import { getAssetSummary } from "./scrapers/asset-summary.js";
import { getCashFlow } from "./scrapers/cash-flow.js";
import {
  getAllGroups,
  getCurrentGroup,
  switchGroup,
  isNoGroup,
  NO_GROUP_ID,
} from "./scrapers/group.js";
import { getLiabilities } from "./scrapers/liabilities.js";
import { getPortfolio } from "./scrapers/portfolio.js";
import { clickRefreshButton, getMaxWaitMinutes } from "./scrapers/refresh.js";
import { getRegisteredAccounts } from "./scrapers/registered-accounts.js";
import { getSpendingTargets } from "./scrapers/spending-targets.js";
import type { ScrapeOptions } from "./types.js";

// ============================================================
// Types
// ============================================================

/** 全体データ（グループ選択なしでのみ取得） */
export interface GlobalData {
  registeredAccounts: ScrapedData["registeredAccounts"];
  portfolio: ScrapedData["portfolio"];
  liabilities: ScrapedData["liabilities"];
  cashFlow: ScrapedData["cashFlow"];
  refreshResult: ScrapedData["refreshResult"];
}

/** グループ固有データ */
export interface GroupData {
  group: Group;
  registeredAccounts: ScrapedData["registeredAccounts"]; // そのグループのアカウント
  assetHistory: ScrapedData["assetHistory"];
  spendingTargets: ScrapedData["spendingTargets"];
  summary: ScrapedData["summary"];
  items: ScrapedData["items"];
}

/** スクレイピング結果 */
export interface ScrapeResult {
  globalData: GlobalData;
  groupDataList: GroupData[];
  defaultGroup: Group | null;
}

// ============================================================
// Phase 1: Global Data (グループ選択なしでのみ取得)
// ============================================================

/**
 * 全体データを取得（グループ選択なしで）
 * - refresh
 * - 全アカウント情報
 * - portfolio
 * - liabilities
 * - cashFlow
 */
async function scrapeGlobalData(
  page: Page,
  options: ScrapeOptions,
  progress: CrawlerProgressReporter,
): Promise<GlobalData> {
  const { skipRefresh = false } = options;

  // Refresh
  let refreshResult = null;
  const refreshStep = await progress.startStep(CRAWLER_STEPS.refresh, {
    maxWaitMinutes: getMaxWaitMinutes(),
  });
  if (skipRefresh) {
    log("Skipping refresh (SKIP_REFRESH=true)");
    await progress.skipStep(refreshStep);
  } else {
    try {
      refreshResult = await clickRefreshButton(page, {
        onWaiting: (waiting) =>
          progress.updateWaiting(refreshStep, "更新中の金融機関が0件になるのを待機", {
            ...waiting,
          }),
      });
      if (refreshResult.completed) {
        await progress.completeStep(refreshStep, { remainingCount: 0 });
      } else {
        await progress.warnStep(
          refreshStep,
          {
            code: "refresh_timeout",
            message: "金融機関の一括更新が待機時間を超えました",
            maxWaitMinutes: getMaxWaitMinutes(),
            incompleteAccounts: refreshResult.incompleteAccounts,
          },
          {
            maxWaitMinutes: getMaxWaitMinutes(),
            remainingCount: refreshResult.remainingCount ?? refreshResult.incompleteAccounts.length,
            incompleteAccounts: refreshResult.incompleteAccounts,
          },
        );
      }
    } catch (error) {
      await progress.failStep(refreshStep, normalizeCrawlerError(error, "refresh_failed"));
      throw error;
    }
  }

  const globalStep = await progress.startStep(CRAWLER_STEPS.globalData);
  let registeredAccounts: Awaited<ReturnType<typeof getRegisteredAccounts>>;
  let portfolio: Awaited<ReturnType<typeof getPortfolio>>;
  let liabilities: Awaited<ReturnType<typeof getLiabilities>>;
  try {
    await switchGroup(page, NO_GROUP_ID);

    // 全アカウント情報
    registeredAccounts = await getRegisteredAccounts(page);
    log(`Registered accounts: ${registeredAccounts.accounts.length}`);

    // Portfolio
    portfolio = await getPortfolio(page);
    log(`Portfolio: ${portfolio.items.length} items`);

    // Liabilities
    liabilities = await getLiabilities(page);
    log(`Liabilities: ${liabilities.items.length} items`);
    await progress.completeStep(globalStep);
  } catch (error) {
    await progress.failStep(globalStep, normalizeCrawlerError(error, "global_data_failed"));
    throw error;
  }

  const { year, month: monthNumber } = getJstDateParts();
  const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
  const cashFlowStep = await progress.startStep(CRAWLER_STEPS.monthlyCashFlow, { month });
  let cashFlow: Awaited<ReturnType<typeof getCashFlow>>;
  try {
    cashFlow = await getCashFlow(page);
    await progress.completeStep(cashFlowStep, { month: cashFlow.month });
    log(`CashFlow: ${cashFlow.items.length} items`);
  } catch (error) {
    await progress.failStep(cashFlowStep, normalizeCrawlerError(error, "monthly_cash_flow_failed"));
    throw error;
  }

  return { registeredAccounts, portfolio, liabilities, cashFlow, refreshResult };
}

// ============================================================
// Phase 2: Group Data (各グループで取得)
// ============================================================

/**
 * グループ固有データを取得
 * - そのグループのアカウント一覧
 * - assetHistory
 * - spendingTargets
 * - assetSummary / assetItems
 */
async function scrapeGroupData(page: Page, group: Group): Promise<GroupData> {
  // そのグループのアカウント一覧
  const registeredAccounts = await getRegisteredAccounts(page);
  log(`Group accounts: ${registeredAccounts.accounts.length}`);

  // Asset Summary
  const summary = await getAssetSummary(page);
  log(`Asset summary: ${summary.totalAssets}`);

  // Asset Items
  const items = await getAssetItems(page);
  log(`Asset items: ${items.length} categories`);

  // Asset History
  const assetHistory = await getAssetHistory(page);
  log(`Asset history: ${assetHistory.points.length} points`);

  // Spending Targets
  const spendingTargets = await getSpendingTargets(page).catch((err) => {
    warn("Failed to scrape spending targets:", err);
    return null;
  });
  if (spendingTargets) {
    log(`Spending targets: ${spendingTargets.categories.length} categories`);
  }

  return {
    group,
    registeredAccounts,
    assetHistory,
    spendingTargets,
    summary,
    items,
  };
}

function buildGroupsToProcess(allGroups: Group[]): Group[] {
  const noGroupEntry = allGroups.find((g) => isNoGroup(g.id));
  return noGroupEntry
    ? allGroups
    : [{ id: NO_GROUP_ID, name: "グループ選択なし", isCurrent: false }, ...allGroups];
}

async function runPhase2(
  page: Page,
  groupsToProcess: Group[],
  defaultGroup: Group | null,
  progress: CrawlerProgressReporter,
): Promise<GroupData[]> {
  phase("Scrape: Group Data");
  const groupDataList: GroupData[] = [];

  for (const groupEntry of groupsToProcess) {
    const groupId = groupEntry.id;
    const groupName = groupEntry.name;

    const groupStep = await progress.startStep(CRAWLER_STEPS.groupData, { groupName });
    log(`--- ${groupName} ---`);
    const group: Group = {
      id: groupId,
      name: groupName,
      isCurrent: groupId === defaultGroup?.id,
    };

    try {
      await switchGroup(page, groupId);
      const groupData = await scrapeGroupData(page, group);
      groupDataList.push(groupData);
      await progress.completeStep(groupStep);
    } catch (error) {
      await progress.failStep(groupStep, normalizeCrawlerError(error, "group_data_failed"));
      throw error;
    }
  }

  return groupDataList;
}

// ============================================================
// Main Entry Point
// ============================================================

/**
 * 全グループのデータをスクレイピング
 *
 * Phase 1: グループ選択なしで全体データ取得
 *   - refresh, 全アカウント, portfolio, liabilities, cashFlow
 *
 * Phase 2: 全グループでグループ固有データ取得（選択なし含む）
 *   - グループのアカウント一覧, assetHistory, spendingTargets
 */
export async function scrapeAllGroups(
  page: Page,
  progress: CrawlerProgressReporter,
  options: ScrapeOptions = {},
): Promise<ScrapeResult> {
  // 現在のグループを記憶
  const defaultGroup = await getCurrentGroup(page);
  log(`Default group: ${defaultGroup?.name ?? "none"}`);

  // 全グループの一覧を取得
  const allGroups = await getAllGroups(page);
  log(`Found ${allGroups.length} groups`);

  const groupsToProcess = buildGroupsToProcess(allGroups);

  phase("Scrape: Global Data");
  const globalData = await scrapeGlobalData(page, options, progress);
  const groupDataList = await runPhase2(page, groupsToProcess, defaultGroup, progress);

  return {
    globalData,
    groupDataList,
    defaultGroup,
  };
}

// ============================================================
// Legacy exports (for backward compatibility)
// ============================================================

/** @deprecated Use scrapeAllGroups instead */
export async function scrape(page: Page, options: ScrapeOptions = {}): Promise<ScrapedData> {
  const { skipRefresh = false } = options;

  let refreshResult = null;
  if (!skipRefresh) {
    refreshResult = await clickRefreshButton(page);
  }

  const currentGroup = await getCurrentGroup(page);
  const summary = await getAssetSummary(page);
  const items = await getAssetItems(page);
  const cashFlow = await getCashFlow(page);
  const portfolio = await getPortfolio(page);
  const liabilities = await getLiabilities(page);
  const assetHistory = await getAssetHistory(page);
  const registeredAccounts = await getRegisteredAccounts(page);
  const spendingTargets = await getSpendingTargets(page).catch(() => null);

  const updatedAt = formatJstDateTimeForDisplay();

  return {
    summary,
    items,
    cashFlow,
    portfolio,
    liabilities,
    assetHistory,
    registeredAccounts,
    spendingTargets,
    currentGroup,
    refreshResult,
    updatedAt,
  };
}
