import type { MonthlySummary, MonthComparison, MoMTrendResult } from "./analyzer-types.js";
import {
  calcAverage,
  calcChangeRate,
  calcLinearSlope,
  calcSavingsRate,
  calcStreak,
} from "./analyzer-utils.js";

export function analyzeMoMTrend(monthlySummaries: MonthlySummary[]): MoMTrendResult {
  if (monthlySummaries.length === 0) {
    return {
      latestMonthPartial: false,
      monthlyComparisons: [],
      streaks: {
        incomeStreak: { direction: "none", months: 0 },
        expenseStreak: { direction: "none", months: 0 },
        netIncomeStreak: { direction: "none", months: 0 },
        savingsRateStreak: { direction: "none", months: 0 },
      },
      overallTrend: "stable",
      acceleration: "steady",
      bestMonth: null,
      worstMonth: null,
      threeMonthAvg: null,
      sixMonthAvg: null,
      latestVsThreeMonthAvg: null,
    };
  }

  const sorted = [...monthlySummaries].sort((a, b) => a.month.localeCompare(b.month));

  const monthlyComparisons: MonthComparison[] = sorted.map((m, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    return {
      month: m.month,
      totalIncome: m.totalIncome,
      totalExpense: m.totalExpense,
      netIncome: m.netIncome,
      savingsRate: calcSavingsRate(m.totalIncome, m.totalExpense),
      incomeDiff: prev ? m.totalIncome - prev.totalIncome : null,
      expenseDiff: prev ? m.totalExpense - prev.totalExpense : null,
      netIncomeDiff: prev ? m.netIncome - prev.netIncome : null,
      incomeChangeRate: prev ? calcChangeRate(m.totalIncome, prev.totalIncome) : null,
      expenseChangeRate: prev ? calcChangeRate(m.totalExpense, prev.totalExpense) : null,
      netIncomeChangeRate: prev ? calcChangeRate(m.netIncome, prev.netIncome) : null,
    };
  });

  const incomes = sorted.map((m) => m.totalIncome);
  const expenses = sorted.map((m) => m.totalExpense);
  const netIncomes = sorted.map((m) => m.netIncome);
  const savingsRates = monthlyComparisons.map((m) => m.savingsRate);

  const streaks = {
    incomeStreak: calcStreak(incomes),
    expenseStreak: calcStreak(expenses),
    netIncomeStreak: calcStreak(netIncomes),
    savingsRateStreak: calcStreak(savingsRates),
  };

  // Overall trend
  let overallTrend: "improving" | "worsening" | "stable" = "stable";
  if (streaks.netIncomeStreak.months >= 2) {
    overallTrend = streaks.netIncomeStreak.direction === "increasing" ? "improving" : "worsening";
  }

  // Acceleration: are the month-over-month changes themselves increasing or decreasing?
  let acceleration: "accelerating" | "decelerating" | "steady" = "steady";
  if (sorted.length >= 3) {
    const netIncomeDiffs = monthlyComparisons
      .slice(1)
      .map((m) => m.netIncomeDiff!)
      .filter((d) => d != null);
    if (netIncomeDiffs.length >= 2) {
      const recentDiffs = netIncomeDiffs.slice(-3);
      const diffSlope = calcLinearSlope(recentDiffs);
      const avgAbsDiff = calcAverage(recentDiffs.map(Math.abs));
      if (avgAbsDiff > 0 && Math.abs(diffSlope) / avgAbsDiff > 0.2) {
        acceleration = diffSlope > 0 ? "accelerating" : "decelerating";
      }
    }
  }

  // Best/worst months
  const bestMonth =
    sorted.length > 0
      ? sorted.reduce((best, m) => (m.netIncome > best.netIncome ? m : best))
      : null;
  const worstMonth =
    sorted.length > 0
      ? sorted.reduce((worst, m) => (m.netIncome < worst.netIncome ? m : worst))
      : null;

  const last3 = sorted.slice(-3);
  const last6 = sorted.slice(-6);

  const buildAvg = (items: MonthlySummary[]) => ({
    income: calcAverage(items.map((m) => m.totalIncome)),
    expense: calcAverage(items.map((m) => m.totalExpense)),
    netIncome: calcAverage(items.map((m) => m.netIncome)),
    savingsRate: calcAverage(items.map((m) => calcSavingsRate(m.totalIncome, m.totalExpense))),
  });

  const threeMonthAvg = last3.length >= 3 ? buildAvg(last3) : null;
  const sixMonthAvg = last6.length >= 6 ? buildAvg(last6) : null;

  // Latest month vs 3-month average
  let latestVsThreeMonthAvg: MoMTrendResult["latestVsThreeMonthAvg"] = null;
  if (threeMonthAvg && sorted.length > 0) {
    const latest = sorted[sorted.length - 1];
    latestVsThreeMonthAvg = {
      incomeDiff: latest.totalIncome - threeMonthAvg.income,
      incomeDiffPct:
        threeMonthAvg.income > 0
          ? ((latest.totalIncome - threeMonthAvg.income) / threeMonthAvg.income) * 100
          : 0,
      expenseDiff: latest.totalExpense - threeMonthAvg.expense,
      expenseDiffPct:
        threeMonthAvg.expense > 0
          ? ((latest.totalExpense - threeMonthAvg.expense) / threeMonthAvg.expense) * 100
          : 0,
      netIncomeDiff: latest.netIncome - threeMonthAvg.netIncome,
    };
  }

  // Detect if latest month is partial (incomplete data)
  let latestMonthPartial = false;
  if (sorted.length >= 2) {
    const latest = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const incomeRatio = prev.totalIncome > 0 ? latest.totalIncome / prev.totalIncome : 1;
    const expenseRatio = prev.totalExpense > 0 ? latest.totalExpense / prev.totalExpense : 1;
    latestMonthPartial = incomeRatio < 0.3 || expenseRatio < 0.3;
  }

  return {
    latestMonthPartial,
    monthlyComparisons,
    streaks,
    overallTrend,
    acceleration,
    bestMonth: bestMonth ? { month: bestMonth.month, netIncome: bestMonth.netIncome } : null,
    worstMonth: worstMonth ? { month: worstMonth.month, netIncome: worstMonth.netIncome } : null,
    threeMonthAvg,
    sixMonthAvg,
    latestVsThreeMonthAvg,
  };
}
