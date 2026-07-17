import type { Db } from "@mf-dashboard/db";
import { createAnalysisTools } from "../insights/analysis-tools.js";
import { createFinancialTools } from "../insights/tools.js";
import { createTransactionSearchTool } from "./transaction-search-tool.js";

export { createAnalysisTools, createFinancialTools, createTransactionSearchTool };

export function createChatTools(db: Db, groupId: string) {
  return {
    searchTransactions: createTransactionSearchTool(db, groupId),
    ...createFinancialTools(db, groupId),
    ...createAnalysisTools(db, groupId),
  };
}
