import type { Db } from "@mf-dashboard/db";
import { createAnalysisTools } from "../insights/analysis-tools.js";
import { createFinancialTools } from "../insights/tools.js";

export { createAnalysisTools, createFinancialTools };

export function createChatTools(db: Db, groupId: string) {
  return {
    ...createFinancialTools(db, groupId),
    ...createAnalysisTools(db, groupId),
  };
}
