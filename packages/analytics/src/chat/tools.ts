import type { Db } from "@mf-dashboard/db";
import { createAnalysisTools } from "../tools/analysis.js";
import { createFinancialTools } from "../tools/financial.js";

export { createAnalysisTools, createFinancialTools };

export function createChatTools(db: Db, groupId: string) {
  return {
    ...createFinancialTools(db, groupId),
    ...createAnalysisTools(db, groupId),
  };
}
