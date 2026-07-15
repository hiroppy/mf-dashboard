import { formatJstDateTimeForDisplay } from "@mf-dashboard/date-utils";
import type { Group, ScrapedData } from "@mf-dashboard/db/types";
import type { Page } from "playwright";
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
import { clickRefreshButton } from "./scrapers/refresh.js";
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
async function scrapeGlobalData(page: Page, options: ScrapeOptions): Promise<GlobalData> {
  const { skipRefresh = false } = options;

  // Refresh
  let refreshResult = null;
  if (skipRefresh) {
    log("Skipping refresh (SKIP_REFRESH=true)");
  } else {
    refreshResult = await clickRefreshButton(page);
  }

  // 全アカウント情報
  const registeredAccounts = await getRegisteredAccounts(page);
  log(`Registered accounts: ${registeredAccounts.accounts.length}`);

  // Portfolio
  const portfolio = await getPortfolio(page);
  log(`Portfolio: ${portfolio.items.length} items`);

  // Liabilities
  const liabilities = await getLiabilities(page);
  log(`Liabilities: ${liabilities.items.length} items`);

  // CashFlow
  const cashFlow = await getCashFlow(page);
  log(`CashFlow: ${cashFlow.items.length} items`);

  return {
    registeredAccounts,
    portfolio,
    liabilities,
    cashFlow,
    refreshResult,
  };
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

async function runPhase1(page: Page, options: ScrapeOptions): Promise<GlobalData> {
  phase("Scrape: Global Data");
  await switchGroup(page, NO_GROUP_ID);
  return scrapeGlobalData(page, options);
}

async function runPhase2(
  page: Page,
  groupsToProcess: Group[],
  defaultGroup: Group | null,
): Promise<GroupData[]> {
  phase("Scrape: Group Data");
  const groupDataList: GroupData[] = [];

  for (const groupEntry of groupsToProcess) {
    const groupId = groupEntry.id;
    const groupName = groupEntry.name;

    log(`--- ${groupName} ---`);
    await switchGroup(page, groupId);

    const group: Group = {
      id: groupId,
      name: groupName,
      isCurrent: groupId === defaultGroup?.id,
    };

    const groupData = await scrapeGroupData(page, group);
    groupDataList.push(groupData);
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
  options: ScrapeOptions = {},
): Promise<ScrapeResult> {
  // 現在のグループを記憶
  const defaultGroup = await getCurrentGroup(page);
  log(`Default group: ${defaultGroup?.name ?? "none"}`);

  // 全グループの一覧を取得
  const allGroups = await getAllGroups(page);
  log(`Found ${allGroups.length} groups`);

  const groupsToProcess = buildGroupsToProcess(allGroups);

  const globalData = await runPhase1(page, options);
  const groupDataList = await runPhase2(page, groupsToProcess, defaultGroup);

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
