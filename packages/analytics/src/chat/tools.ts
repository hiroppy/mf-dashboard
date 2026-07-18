import type { Db } from "@mf-dashboard/db";
import { createAnalysisTools } from "../insights/analysis-tools";
import { createFinancialTools } from "../insights/tools";
import { createFinanceNavigationTool } from "./navigation-tool";
import { createFinancePresentationTool } from "./presentation-tool";
import { createTransactionSearchTool } from "./transaction-search-tool";

export {
  createAnalysisTools,
  createFinanceNavigationTool,
  createFinancePresentationTool,
  createFinancialTools,
  createTransactionSearchTool,
};

export function createFinanceChatTools(db: Db, groupId: string) {
  return {
    searchTransactions: createTransactionSearchTool(db, groupId),
    getFinanceDashboardRoute: createFinanceNavigationTool(groupId),
    presentFinanceCards: createFinancePresentationTool(groupId),
    ...createFinancialTools(db, groupId),
    ...createAnalysisTools(db, groupId),
  };
}

export function createChatTools(db: Db, groupId: string) {
  return createFinanceChatTools(db, groupId);
}
