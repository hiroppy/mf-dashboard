import type { Db } from "@mf-dashboard/db";
import { createAnalysisTools } from "../insights/analysis-tools";
import { createFinancialTools } from "../insights/tools";
import { createFinanceNavigationTool } from "./navigation-tool";
import { createFinancePresentationTool } from "./presentation-tool";
import { createTransactionSearchTool } from "./transaction-search-tool";

export function createFinanceChatTools(db: Db, groupId: string) {
  const allowedHrefs = new Set<string>();

  return {
    searchTransactions: createTransactionSearchTool(db, groupId),
    getFinanceDashboardRoute: createFinanceNavigationTool(groupId, allowedHrefs),
    presentFinanceCards: createFinancePresentationTool(groupId, allowedHrefs),
    ...createFinancialTools(db, groupId),
    ...createAnalysisTools(db, groupId),
  };
}

export function createChatTools(db: Db, groupId: string) {
  return createFinanceChatTools(db, groupId);
}
