import type { Db } from "@mf-dashboard/db";
import { createAnalysisTools } from "../insights/analysis-tools";
import { createFinancialTools } from "../insights/tools";
import { createFinanceNavigationTool } from "./navigation-tool";
import { createFinancePresentationTool } from "./presentation-tool";
import { createTransactionSearchTool } from "./transaction-search-tool";

function createChatFinancialTools(db: Db, groupId: string) {
  const tools = createFinancialTools(db, groupId);

  return {
    getAccountsWithAssets: tools.getAccountsWithAssets,
    getAccountsGroupedByCategory: tools.getAccountsGroupedByCategory,
    getHoldingsWithLatestValues: tools.getHoldingsWithLatestValues,
    getHoldingsWithDailyChange: tools.getHoldingsWithDailyChange,
    getMonthlySummaryByMonth: tools.getMonthlySummaryByMonth,
    getMonthlyCategoryTotals: tools.getMonthlyCategoryTotals,
    getExpenseByFixedVariable: tools.getExpenseByFixedVariable,
    getYearToDateSummary: tools.getYearToDateSummary,
    getLatestMonthlySummary: tools.getLatestMonthlySummary,
    getAssetBreakdownByCategory: tools.getAssetBreakdownByCategory,
    getLiabilityBreakdownByCategory: tools.getLiabilityBreakdownByCategory,
    getLatestTotalAssets: tools.getLatestTotalAssets,
    getDailyAssetChange: tools.getDailyAssetChange,
    getCategoryChangesForPeriod: tools.getCategoryChangesForPeriod,
    getFinancialMetrics: tools.getFinancialMetrics,
    getHoldingsByAccountId: tools.getHoldingsByAccountId,
    getLatestAnalytics: tools.getLatestAnalytics,
  };
}

export function createFinanceChatTools(db: Db, groupId: string) {
  const allowedHrefs = new Set<string>();

  return {
    searchTransactions: createTransactionSearchTool(db, groupId),
    getFinanceDashboardRoute: createFinanceNavigationTool(groupId, allowedHrefs),
    presentFinanceCards: createFinancePresentationTool(groupId, allowedHrefs),
    ...createChatFinancialTools(db, groupId),
    ...createAnalysisTools(db, groupId),
  };
}

export function createChatTools(db: Db, groupId: string) {
  return createFinanceChatTools(db, groupId);
}
