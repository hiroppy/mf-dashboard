import type { MonthlySummary, SavingsInput, SavingsTrajectoryResult } from "./analyzer-types.js";
import { calcAverage, calcLinearSlope, calcSavingsRate } from "./analyzer-utils.js";

export function analyzeSavingsTrajectory(
  currentMetrics: SavingsInput,
  monthlySummaries: MonthlySummary[],
): SavingsTrajectoryResult {
  const currentFundMonths = currentMetrics.emergencyFundMonths;
  const sorted = [...monthlySummaries].sort((a, b) => a.month.localeCompare(b.month));

  // Savings rate history
  const savingsRateHistory = sorted.map((m) => ({
    month: m.month,
    savingsRate: calcSavingsRate(m.totalIncome, m.totalExpense),
  }));

  const savingsRates = savingsRateHistory.map((s) => s.savingsRate);
  const averageSavingsRate = calcAverage(savingsRates);

  // Savings rate trend
  let savingsRateTrend: "improving" | "declining" | "stable" = "stable";
  if (savingsRates.length >= 3) {
    const slope = calcLinearSlope(savingsRates);
    const threshold = 1; // 1% per month
    if (slope > threshold) savingsRateTrend = "improving";
    else if (slope < -threshold) savingsRateTrend = "declining";
  }

  // Cumulative net income
  const cumulativeNetIncome = sorted.reduce((s, m) => s + m.netIncome, 0);

  // Liquid assets ratio
  const liquidAssetsToTotalRatio =
    currentMetrics.totalAssets > 0
      ? (currentMetrics.liquidAssets / currentMetrics.totalAssets) * 100
      : 0;

  // Emergency fund change estimation
  let previousEmergencyFundMonths: number | null = null;
  let emergencyFundChange: number | null = null;
  if (sorted.length >= 2) {
    const previousMonthExpense = sorted[sorted.length - 2].totalExpense;
    if (previousMonthExpense > 0) {
      previousEmergencyFundMonths = currentMetrics.liquidAssets / previousMonthExpense;
      emergencyFundChange = currentFundMonths - previousEmergencyFundMonths;
    }
  }

  // Direction
  let direction: "improving" | "declining" | "stable" = "stable";
  if (emergencyFundChange != null) {
    if (emergencyFundChange > 0.5) direction = "improving";
    else if (emergencyFundChange < -0.5) direction = "declining";
  }

  // Primary factor
  let primaryFactor: SavingsTrajectoryResult["primaryFactor"] = "mixed";
  if (sorted.length >= 2) {
    const prevExpense = sorted[sorted.length - 2].totalExpense;
    const expenseChanged =
      prevExpense > 0 &&
      Math.abs(currentMetrics.monthlyExpenseAvg - prevExpense) / prevExpense > 0.05;

    if (expenseChanged && currentMetrics.monthlyExpenseAvg > prevExpense) {
      primaryFactor = "expense_increase";
    } else if (expenseChanged && currentMetrics.monthlyExpenseAvg < prevExpense) {
      primaryFactor = "expense_decrease";
    } else if (direction === "improving") {
      primaryFactor = "asset_increase";
    } else if (direction === "declining") {
      primaryFactor = "asset_decrease";
    }
  }

  // Months to 6-month target
  let monthsToSixMonthTarget: number | null = null;
  if (currentFundMonths < 6 && averageSavingsRate > 0 && sorted.length > 0) {
    const avgIncome = calcAverage(sorted.map((m) => m.totalIncome));
    const estimatedMonthlySaving = avgIncome * (averageSavingsRate / 100);
    if (estimatedMonthlySaving > 0) {
      const targetLiquidAssets = currentMetrics.monthlyExpenseAvg * 6;
      const gap = targetLiquidAssets - currentMetrics.liquidAssets;
      if (gap > 0) {
        monthsToSixMonthTarget = Math.ceil(gap / estimatedMonthlySaving);
      }
    }
  }

  return {
    currentEmergencyFundMonths: currentFundMonths,
    previousEmergencyFundMonths,
    emergencyFundChange,
    direction,
    primaryFactor,
    monthsToSixMonthTarget,
    savingsRateHistory,
    averageSavingsRate,
    savingsRateTrend,
    cumulativeNetIncome,
    liquidAssetsToTotalRatio,
  };
}
