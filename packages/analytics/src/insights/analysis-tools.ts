import type { Db } from "@moneyforward-daily-action/db";
import {
  getMonthlySummaries,
  getMonthlyCategoryTotals,
  getHoldingsWithLatestValues,
  getHoldingsWithDailyChange,
  getFinancialMetrics,
  getAvailableMonths,
} from "@moneyforward-daily-action/db";
import { tool } from "ai";
import { z } from "zod";
import { analyzeIncomeStability } from "./analyze-income-stability.js";
import { analyzeMoMTrend } from "./analyze-mom-trend.js";
import { analyzePortfolioRisk } from "./analyze-portfolio-risk.js";
import { analyzeSavingsTrajectory } from "./analyze-savings-trajectory.js";
import { analyzeSpendingComparison } from "./analyze-spending-comparison.js";
import { excludeCurrentMonth, getCurrentMonth } from "./analyzer-utils.js";

export function createAnalysisTools(db: Db, groupId: string) {
  return {
    analyzeMoMTrend: tool({
      description:
        "月次収支の前月比トレンドを分析。各月の変化率・連続増減ストリーク・3/6ヶ月平均を計算",
      inputSchema: z.object({}),
      execute: () => {
        const summaries = excludeCurrentMonth(getMonthlySummaries({ groupId }, db));
        return analyzeMoMTrend(summaries);
      },
    }),
    analyzeSpendingComparison: tool({
      description: "カテゴリ別支出を過去平均と比較。乖離度・異常検出・新規カテゴリを特定",
      inputSchema: z.object({}),
      execute: () => {
        const currentMonth = getCurrentMonth();
        const monthObjects = getAvailableMonths(groupId, db).filter(
          (m) => m.month !== currentMonth,
        );
        if (monthObjects.length === 0) {
          return { categories: [], newCategories: [] };
        }
        const latestMonth = monthObjects[0].month;
        const months = monthObjects.slice(0, 7).map((m) => m.month);
        const allCategoryTotals = months.map((m) => getMonthlyCategoryTotals(m, groupId, db));
        const flatTotals = allCategoryTotals.flat();
        return analyzeSpendingComparison(flatTotals, latestMonth);
      },
    }),
    analyzePortfolioRisk: tool({
      description:
        "ポートフォリオのリスク分析。集中度・日次変動・含み損益を評価しリスクレベルを判定",
      inputSchema: z.object({}),
      execute: () => {
        const holdingsRaw = getHoldingsWithLatestValues(groupId, db);
        const dailyChangeRaw = getHoldingsWithDailyChange(groupId, db);
        const metrics = getFinancialMetrics(groupId, db);

        const holdings = holdingsRaw.map((h) => ({
          name: h.name,
          amount: h.amount ?? 0,
          unrealizedGain: h.unrealizedGain ?? 0,
          unrealizedGainPct: h.unrealizedGainPct ?? 0,
        }));

        const dailyChanges = dailyChangeRaw.map((h) => ({
          name: h.name,
          dailyChange: h.dailyChange,
        }));

        const diversificationScore = metrics?.investment.diversificationScore ?? 0;

        return analyzePortfolioRisk(holdings, dailyChanges, diversificationScore);
      },
    }),
    analyzeSavingsTrajectory: tool({
      description:
        "貯蓄の推移分析。緊急予備資金月数の変化・方向・主因、貯蓄率履歴・トレンド、6ヶ月目標までの予測を提供",
      inputSchema: z.object({}),
      execute: () => {
        const metrics = getFinancialMetrics(groupId, db);
        const summaries = getMonthlySummaries({ groupId }, db);

        if (!metrics) {
          return {
            currentEmergencyFundMonths: 0,
            previousEmergencyFundMonths: null,
            emergencyFundChange: null,
            direction: "stable" as const,
            primaryFactor: "mixed" as const,
            monthsToSixMonthTarget: null,
            savingsRateHistory: [],
            averageSavingsRate: 0,
            savingsRateTrend: "stable" as const,
            cumulativeNetIncome: 0,
            liquidAssetsToTotalRatio: 0,
          };
        }

        return analyzeSavingsTrajectory(metrics.savings, excludeCurrentMonth(summaries));
      },
    }),
    analyzeIncomeStability: tool({
      description: "収入の安定性分析。変動係数・安定性分類・外れ値月・傾向を算出",
      inputSchema: z.object({}),
      execute: () => {
        const summaries = excludeCurrentMonth(getMonthlySummaries({ groupId }, db));
        return analyzeIncomeStability(summaries);
      },
    }),
  };
}
