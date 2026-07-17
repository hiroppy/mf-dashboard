import type { Db } from "@mf-dashboard/db";
import { describe, expect, it } from "vitest";
import { createAnalysisTools, createChatTools, createFinancialTools } from "./tools.js";

const db = {} as Db;
const groupId = "test-group";

describe("createChatTools", () => {
  it("combines every financial and analysis tool", () => {
    const financialTools = createFinancialTools(db, groupId);
    const analysisTools = createAnalysisTools(db, groupId);

    expect(Object.keys(createChatTools(db, groupId))).toEqual([
      ...Object.keys(financialTools),
      ...Object.keys(analysisTools),
    ]);
  });

  it("includes tools for each household finance chat capability", () => {
    const tools = createChatTools(db, groupId);

    expect(tools).toEqual(
      expect.objectContaining({
        getMonthlySummaryByMonth: expect.any(Object),
        getMonthlyCategoryTotals: expect.any(Object),
        getAssetBreakdownByCategory: expect.any(Object),
        getHoldingsWithLatestValues: expect.any(Object),
        getFinancialMetrics: expect.any(Object),
        analyzeMoMTrend: expect.any(Object),
        analyzeSpendingComparison: expect.any(Object),
        analyzePortfolioRisk: expect.any(Object),
        analyzeSavingsTrajectory: expect.any(Object),
        analyzeIncomeStability: expect.any(Object),
      }),
    );
  });
});
