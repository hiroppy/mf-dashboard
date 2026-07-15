import { formatJstDateTimeForDisplay } from "@mf-dashboard/date-utils";
import type { ScrapedData } from "@mf-dashboard/db/types";
import type { GlobalData, GroupData } from "./scraper.js";

/**
 * GlobalData + GroupData から ScrapedData を構築
 * 「グループ選択なし」の全データ保存用
 */
export function buildScrapedData(globalData: GlobalData, groupData: GroupData): ScrapedData {
  const updatedAt = formatJstDateTimeForDisplay();

  return {
    summary: groupData.summary,
    items: groupData.items,
    cashFlow: globalData.cashFlow,
    portfolio: globalData.portfolio,
    liabilities: globalData.liabilities,
    assetHistory: groupData.assetHistory,
    registeredAccounts: globalData.registeredAccounts,
    spendingTargets: groupData.spendingTargets,
    currentGroup: groupData.group,
    refreshResult: globalData.refreshResult,
    updatedAt,
  };
}

/**
 * GroupData から ScrapedData を構築
 * 各グループのグループ固有データ保存用
 */
export function buildGroupOnlyScrapedData(groupData: GroupData): ScrapedData {
  const updatedAt = formatJstDateTimeForDisplay();

  return {
    summary: groupData.summary,
    items: groupData.items,
    cashFlow: { month: "", totalIncome: 0, totalExpense: 0, balance: 0, items: [] },
    portfolio: { items: [], totalAssets: 0 },
    liabilities: { items: [], totalLiabilities: 0 },
    assetHistory: groupData.assetHistory,
    registeredAccounts: groupData.registeredAccounts,
    spendingTargets: groupData.spendingTargets,
    currentGroup: groupData.group,
    refreshResult: null,
    updatedAt,
  };
}
