import type { Db } from "@moneyforward-daily-action/db";
import {
  getAccountsWithAssets,
  getAccountsGroupedByCategory,
  getTransactionsByMonth,
  getHoldingsWithLatestValues,
  getHoldingsWithDailyChange,
  getMonthlySummaries,
  getMonthlySummaryByMonth,
  getMonthlyCategoryTotals,
  getExpenseByFixedVariable,
  getAvailableMonths,
  getYearToDateSummary,
  getLatestMonthlySummary,
  getAssetBreakdownByCategory,
  getLiabilityBreakdownByCategory,
  getAssetHistory,
  getLatestTotalAssets,
  getDailyAssetChange,
  getCategoryChangesForPeriod,
  getFinancialMetrics,
} from "@moneyforward-daily-action/db";
import { tool } from "ai";
import { z } from "zod";

export function createFinancialTools(db: Db, groupId: string) {
  return {
    getAccountsWithAssets: tool({
      description: "全アクティブ口座と残高・ステータス・金融機関カテゴリを取得",
      inputSchema: z.object({}),
      execute: async () => getAccountsWithAssets(groupId, db),
    }),
    getAccountsGroupedByCategory: tool({
      description: "口座をカテゴリ別にグループ化して取得",
      inputSchema: z.object({}),
      execute: async () => getAccountsGroupedByCategory(groupId, db),
    }),
    getTransactionsByMonth: tool({
      description: "指定月の全取引を取得",
      inputSchema: z.object({
        month: z.string().describe("対象月 (YYYY-MM形式)"),
      }),
      execute: async ({ month }) => getTransactionsByMonth(month, groupId, db),
    }),
    getHoldingsWithLatestValues: tool({
      description: "全保有銘柄の最新評価額・含み損益を取得",
      inputSchema: z.object({}),
      execute: async () => getHoldingsWithLatestValues(groupId, db),
    }),
    getHoldingsWithDailyChange: tool({
      description: "全保有銘柄の前日比変動を取得",
      inputSchema: z.object({}),
      execute: async () => getHoldingsWithDailyChange(groupId, db),
    }),
    getMonthlySummaries: tool({
      description: "月次収支サマリーの一覧を取得（最新順）",
      inputSchema: z.object({
        limit: z.number().optional().describe("取得件数（省略時は全件）"),
      }),
      execute: async ({ limit }) => getMonthlySummaries({ limit, groupId }, db),
    }),
    getMonthlySummaryByMonth: tool({
      description: "指定月の収支サマリーを取得",
      inputSchema: z.object({
        month: z.string().describe("対象月 (YYYY-MM形式)"),
      }),
      execute: async ({ month }) => getMonthlySummaryByMonth(month, groupId, db),
    }),
    getMonthlyCategoryTotals: tool({
      description: "指定月のカテゴリ別支出・収入合計を取得",
      inputSchema: z.object({
        month: z.string().describe("対象月 (YYYY-MM形式)"),
      }),
      execute: async ({ month }) => getMonthlyCategoryTotals(month, groupId, db),
    }),
    getExpenseByFixedVariable: tool({
      description: "指定月の支出を固定費・変動費に分類して取得",
      inputSchema: z.object({
        month: z.string().describe("対象月 (YYYY-MM形式)"),
      }),
      execute: async ({ month }) => getExpenseByFixedVariable(month, groupId, db),
    }),
    getAvailableMonths: tool({
      description: "データが存在する月の一覧を取得",
      inputSchema: z.object({}),
      execute: async () => getAvailableMonths(groupId, db),
    }),
    getYearToDateSummary: tool({
      description: "年初来の収支サマリーを取得",
      inputSchema: z.object({
        year: z.number().optional().describe("対象年（省略時は今年）"),
      }),
      execute: async ({ year }) => getYearToDateSummary({ year, groupId }, db),
    }),
    getLatestMonthlySummary: tool({
      description: "最新月の収支サマリーを取得",
      inputSchema: z.object({}),
      execute: async () => getLatestMonthlySummary(groupId, db),
    }),
    getAssetBreakdownByCategory: tool({
      description: "資産をカテゴリ別に分類した内訳を取得",
      inputSchema: z.object({}),
      execute: async () => getAssetBreakdownByCategory(groupId, db),
    }),
    getLiabilityBreakdownByCategory: tool({
      description: "負債をカテゴリ別に分類した内訳を取得",
      inputSchema: z.object({}),
      execute: async () => getLiabilityBreakdownByCategory(groupId, db),
    }),
    getAssetHistory: tool({
      description: "資産残高の日次推移を取得",
      inputSchema: z.object({
        limit: z.number().optional().describe("取得件数（省略時は全件）"),
      }),
      execute: async ({ limit }) => getAssetHistory({ limit, groupId }, db),
    }),
    getLatestTotalAssets: tool({
      description: "最新の総資産額を取得",
      inputSchema: z.object({}),
      execute: async () => getLatestTotalAssets(groupId, db),
    }),
    getDailyAssetChange: tool({
      description: "前日比の資産変動額を取得",
      inputSchema: z.object({}),
      execute: async () => getDailyAssetChange(groupId, db),
    }),
    getCategoryChangesForPeriod: tool({
      description: "指定期間のカテゴリ別資産変動を取得",
      inputSchema: z.object({
        period: z.enum(["daily", "weekly", "monthly"]).describe("期間（daily/weekly/monthly）"),
      }),
      execute: async ({ period }) => getCategoryChangesForPeriod(period, groupId, db),
    }),
    getFinancialMetrics: tool({
      description:
        "事前計算済みの財務メトリクス（貯蓄率・投資損益・支出傾向・成長率・ヘルススコア等）を一括取得",
      inputSchema: z.object({}),
      execute: async () => getFinancialMetrics(groupId, db),
    }),
  };
}
