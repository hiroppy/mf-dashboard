import type { MonthlySummary, IncomeStabilityResult } from "./analyzer-types.js";
import { calcAverage, calcLinearSlope, calcMedian, calcStdDev } from "./analyzer-utils.js";

export function analyzeIncomeStability(monthlySummaries: MonthlySummary[]): IncomeStabilityResult {
  if (monthlySummaries.length === 0) {
    return {
      mean: 0,
      median: 0,
      stdDev: 0,
      coefficientOfVariation: 0,
      stability: "very_stable",
      outlierMonths: [],
      trend: "flat",
      trendSlopePerMonth: 0,
      minMonth: null,
      maxMonth: null,
      latestVsMean: null,
    };
  }

  const sorted = [...monthlySummaries].sort((a, b) => a.month.localeCompare(b.month));
  const incomes = sorted.map((m) => m.totalIncome);

  const mean = calcAverage(incomes);
  const median = calcMedian(incomes);
  const stdDev = calcStdDev(incomes, mean);
  const coefficientOfVariation = mean > 0 ? (stdDev / mean) * 100 : 0;

  // Stability
  let stability: IncomeStabilityResult["stability"];
  if (coefficientOfVariation < 5) stability = "very_stable";
  else if (coefficientOfVariation < 15) stability = "stable";
  else if (coefficientOfVariation < 30) stability = "variable";
  else stability = "highly_variable";

  // Outliers
  const outlierMonths = sorted
    .filter((m) => stdDev > 0 && Math.abs(m.totalIncome - mean) > 2 * stdDev)
    .map((m) => ({
      month: m.month,
      income: m.totalIncome,
      deviationFromMean: m.totalIncome - mean,
      deviationPct: mean > 0 ? ((m.totalIncome - mean) / mean) * 100 : 0,
    }));

  // Trend
  const slope = calcLinearSlope(incomes);
  const slopeThreshold = mean * 0.02;
  let trend: "increasing" | "decreasing" | "flat" = "flat";
  if (incomes.length >= 3) {
    if (slope > slopeThreshold) trend = "increasing";
    else if (slope < -slopeThreshold) trend = "decreasing";
  }

  // Min/max months
  const minMonth = sorted.reduce((min, m) => (m.totalIncome < min.totalIncome ? m : min));
  const maxMonth = sorted.reduce((max, m) => (m.totalIncome > max.totalIncome ? m : max));

  // Latest vs mean
  const latest = sorted[sorted.length - 1];
  const latestVsMean = {
    diff: latest.totalIncome - mean,
    diffPct: mean > 0 ? ((latest.totalIncome - mean) / mean) * 100 : 0,
  };

  return {
    mean,
    median,
    stdDev,
    coefficientOfVariation,
    stability,
    outlierMonths,
    trend,
    trendSlopePerMonth: slope,
    minMonth: { month: minMonth.month, income: minMonth.totalIncome },
    maxMonth: { month: maxMonth.month, income: maxMonth.totalIncome },
    latestVsMean,
  };
}
