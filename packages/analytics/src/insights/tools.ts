import type { Db } from "@mf-dashboard/db";
import {
  getAccountsWithAssets,
  getAccountsGroupedByCategory,
  getTransactionsByMonth,
  getTransactionsByAccountId,
  getHoldingsWithLatestValues,
  getHoldingsWithDailyChange,
  getHoldingsByAccountId,
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
  getAssetHistoryWithCategories,
  getLatestTotalAssets,
  getDailyAssetChange,
  getCategoryChangesForPeriod,
  getFinancialMetrics,
  getLatestAnalytics,
} from "@mf-dashboard/db";
import { tool } from "ai";
import { z } from "zod";

export function createFinancialTools(db: Db, groupId: string) {
  return {
    getAccountsWithAssets: tool({
      description: "全アクティブ口座と残高・ステータス・金融機関カテゴリを取得",
      inputSchema: z.object({}),
      execute: async () => await getAccountsWithAssets(groupId, db),
    }),
    getAccountsGroupedByCategory: tool({
      description: "口座をカテゴリ別にグループ化して取得",
      inputSchema: z.object({}),
      execute: async () => await getAccountsGroupedByCategory(groupId, db),
    }),
    getTransactionsByMonth: tool({
      description: "指定月の全取引を取得",
      inputSchema: z.object({
        month: z.string().describe("対象月 (YYYY-MM形式)"),
      }),
      execute: async ({ month }) => await getTransactionsByMonth(month, groupId, db),
    }),
    getHoldingsWithLatestValues: tool({
      description: "全保有銘柄の最新評価額・含み損益を取得",
      inputSchema: z.object({}),
      execute: async () => await getHoldingsWithLatestValues(groupId, db),
    }),
    getHoldingsWithDailyChange: tool({
      description: "全保有銘柄の前日比変動を取得",
      inputSchema: z.object({}),
      execute: async () => await getHoldingsWithDailyChange(groupId, db),
    }),
    getMonthlySummaries: tool({
      description: "月次収支サマリーの一覧を取得（最新順）",
      inputSchema: z.object({
        limit: z.number().optional().describe("取得件数（省略時は全件）"),
      }),
      execute: async ({ limit }) => await getMonthlySummaries({ limit, groupId }, db),
    }),
    getMonthlySummaryByMonth: tool({
      description: "指定月の収支サマリーを取得",
      inputSchema: z.object({
        month: z.string().describe("対象月 (YYYY-MM形式)"),
      }),
      execute: async ({ month }) => await getMonthlySummaryByMonth(month, groupId, db),
    }),
    getMonthlyCategoryTotals: tool({
      description: "指定月のカテゴリ別支出・収入合計を取得",
      inputSchema: z.object({
        month: z.string().describe("対象月 (YYYY-MM形式)"),
      }),
      execute: async ({ month }) => await getMonthlyCategoryTotals(month, groupId, db),
    }),
    getExpenseByFixedVariable: tool({
      description: "指定月の支出を固定費・変動費に分類して取得",
      inputSchema: z.object({
        month: z.string().describe("対象月 (YYYY-MM形式)"),
      }),
      execute: async ({ month }) => await getExpenseByFixedVariable(month, groupId, db),
    }),
    getAvailableMonths: tool({
      description: "データが存在する月の一覧を取得",
      inputSchema: z.object({}),
      execute: async () => await getAvailableMonths(groupId, db),
    }),
    getYearToDateSummary: tool({
      description: "年初来の収支サマリーを取得",
      inputSchema: z.object({
        year: z.number().optional().describe("対象年（省略時は今年）"),
      }),
      execute: async ({ year }) => await getYearToDateSummary({ year, groupId }, db),
    }),
    getLatestMonthlySummary: tool({
      description: "最新月の収支サマリーを取得",
      inputSchema: z.object({}),
      execute: async () => await getLatestMonthlySummary(groupId, db),
    }),
    getAssetBreakdownByCategory: tool({
      description: "資産をカテゴリ別に分類した内訳を取得",
      inputSchema: z.object({}),
      execute: async () => await getAssetBreakdownByCategory(groupId, db),
    }),
    getLiabilityBreakdownByCategory: tool({
      description: "負債をカテゴリ別に分類した内訳を取得",
      inputSchema: z.object({}),
      execute: async () => await getLiabilityBreakdownByCategory(groupId, db),
    }),
    getAssetHistory: tool({
      description: "資産残高の日次推移を取得",
      inputSchema: z.object({
        limit: z.number().optional().describe("取得件数（省略時は全件）"),
      }),
      execute: async ({ limit }) => await getAssetHistory({ limit, groupId }, db),
    }),
    getLatestTotalAssets: tool({
      description: "最新の総資産額を取得",
      inputSchema: z.object({}),
      execute: async () => await getLatestTotalAssets(groupId, db),
    }),
    getDailyAssetChange: tool({
      description: "前日比の資産変動額を取得",
      inputSchema: z.object({}),
      execute: async () => await getDailyAssetChange(groupId, db),
    }),
    getCategoryChangesForPeriod: tool({
      description: "指定期間のカテゴリ別資産変動を取得",
      inputSchema: z.object({
        period: z.enum(["daily", "weekly", "monthly"]).describe("期間（daily/weekly/monthly）"),
      }),
      execute: async ({ period }) => await getCategoryChangesForPeriod(period, groupId, db),
    }),
    getFinancialMetrics: tool({
      description:
        "事前計算済みの財務メトリクス（貯蓄率・投資損益・支出傾向・成長率・ヘルススコア等）を一括取得",
      inputSchema: z.object({}),
      execute: async () => await getFinancialMetrics(groupId, db),
    }),
    getHoldingsByAccountId: tool({
      description: "指定口座の保有銘柄・評価額・含み損益を取得",
      inputSchema: z.object({
        accountId: z.number().describe("口座ID"),
      }),
      execute: async ({ accountId }) => await getHoldingsByAccountId(accountId, groupId, db),
    }),
    getTransactionsByAccountId: tool({
      description: "指定口座の取引履歴を取得",
      inputSchema: z.object({
        accountId: z.number().describe("口座ID"),
      }),
      execute: async ({ accountId }) => await getTransactionsByAccountId(accountId, groupId, db),
    }),
    getAssetHistoryWithCategories: tool({
      description: "カテゴリ別の資産推移を取得（日次、カテゴリ内訳付き）",
      inputSchema: z.object({
        limit: z.number().optional().describe("取得件数（省略時は全件）"),
      }),
      execute: async ({ limit }) => await getAssetHistoryWithCategories({ limit, groupId }, db),
    }),
    getLatestAnalytics: tool({
      description: "保存済みのAI分析レポート（メトリクス＋LLMインサイト）を取得",
      inputSchema: z.object({}),
      execute: async () => await getLatestAnalytics(groupId, db),
    }),
  };
}
