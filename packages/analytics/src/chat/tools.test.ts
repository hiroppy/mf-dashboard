import type { Db } from "@mf-dashboard/db";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAnalysisTools } from "../insights/analysis-tools.js";
import { createFinancialTools } from "../insights/tools.js";
import { createChatTools, createFinanceChatTools } from "./tools.js";

const db = {} as Db;
const groupId = "test-group";
const excludedChatFinancialTools = new Set([
  "getTransactionsByMonth",
  "getTransactionsByAccountId",
  "getMonthlySummaries",
  "getAvailableMonths",
  "getAssetHistory",
  "getAssetHistoryWithCategories",
  "getAccountsWithAssets",
  "getAccountsGroupedByCategory",
  "getHoldingsWithLatestValues",
  "getHoldingsWithDailyChange",
  "getHoldingsByAccountId",
]);
const excludedChatAnalysisTools = new Set([
  "analyzeMoMTrend",
  "analyzeSavingsTrajectory",
  "analyzeIncomeStability",
]);
const execOptions = {
  toolCallId: "test",
  messages: [],
  abortSignal: undefined as never,
  context: {} as never,
};

describe("createChatTools", () => {
  it("combines bounded financial and analysis tools", () => {
    const financialTools = createFinancialTools(db, groupId);
    const analysisTools = createAnalysisTools(db, groupId);
    const chatFinancialToolNames = Object.keys(financialTools).filter(
      (name) => !excludedChatFinancialTools.has(name),
    );

    expect(Object.keys(createChatTools(db, groupId))).toEqual([
      "searchTransactions",
      "getFinanceDashboardRoute",
      "presentFinanceCards",
      ...chatFinancialToolNames,
      ...Object.keys(analysisTools).filter((name) => !excludedChatAnalysisTools.has(name)),
    ]);
  });

  it("excludes unbounded raw history tools from interactive chat", () => {
    const toolNames = new Set(Object.keys(createChatTools(db, groupId)));

    for (const name of excludedChatFinancialTools) expect(toolNames.has(name)).toBe(false);
    for (const name of excludedChatAnalysisTools) expect(toolNames.has(name)).toBe(false);
    expect(toolNames.has("searchTransactions")).toBe(true);
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
        getLatestTotalAssets: expect.any(Object),
        getFinancialMetrics: expect.any(Object),
        analyzeSpendingComparison: expect.any(Object),
        analyzePortfolioRisk: expect.any(Object),
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
