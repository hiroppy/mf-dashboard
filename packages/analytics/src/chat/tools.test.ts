import type { Db } from "@mf-dashboard/db";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAnalysisTools } from "../insights/analysis-tools.js";
import { createFinancialTools } from "../insights/tools.js";
import { createChatTools, createFinanceChatTools } from "./tools.js";

const db = {} as Db;
const groupId = "test-group";
const execOptions = {
  toolCallId: "test",
  messages: [],
  abortSignal: undefined as never,
  context: {} as never,
};

describe("createChatTools", () => {
  it("combines every financial and analysis tool", () => {
    const financialTools = createFinancialTools(db, groupId);
    const analysisTools = createAnalysisTools(db, groupId);

    expect(Object.keys(createChatTools(db, groupId))).toEqual([
      "searchTransactions",
      "getFinanceDashboardRoute",
      "presentFinanceCards",
      ...Object.keys(financialTools),
      ...Object.keys(analysisTools),
    ]);
  });

  it("keeps the existing tool factory compatible", () => {
    expect(Object.keys(createChatTools(db, groupId))).toEqual(
      Object.keys(createFinanceChatTools(db, groupId)),
    );
  });

  it("includes tools for each household finance chat capability", () => {
    const tools = createChatTools(db, groupId);

    expect(tools).toEqual(
      expect.objectContaining({
        searchTransactions: expect.any(Object),
        getFinanceDashboardRoute: expect.any(Object),
        presentFinanceCards: expect.any(Object),
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

  it("allows presentation CTAs only after the navigation tool returns the route", async () => {
    const tools = createChatTools(db, groupId);
    const presentationSchema = tools.presentFinanceCards.inputSchema as z.ZodType;
    const input = {
      cards: [
        {
          type: "action",
          title: "詳細を確認",
          description: "収支ページで確認できます",
          action: { label: "収支を見る", href: `/${groupId}/cf/2026-07` },
        },
      ],
    };

    expect(presentationSchema.safeParse(input).success).toBe(false);
    await tools.getFinanceDashboardRoute.execute?.(
      { page: "cashFlow", month: "2026-07" },
      execOptions,
    );
    expect(presentationSchema.safeParse(input).success).toBe(true);
  });
});
