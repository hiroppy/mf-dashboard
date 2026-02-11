import type {
  CategoryTotal,
  CategoryComparison,
  SpendingComparisonResult,
} from "./analyzer-types.js";
import { calcAverage, calcLinearSlope, calcStdDev } from "./analyzer-utils.js";

export function analyzeSpendingComparison(
  monthlyCategoryTotals: CategoryTotal[],
  latestMonth: string,
): SpendingComparisonResult {
  const expenses = monthlyCategoryTotals.filter((t) => t.type === "expense");

  if (expenses.length === 0) {
    return {
      categories: [],
      newCategories: [],
      totalCurrentExpense: 0,
      totalPreviousMonthExpense: null,
      totalChangeRate: null,
      anomalousCount: 0,
      elevatedCount: 0,
      topIncreasing: [],
      topDecreasing: [],
    };
  }

  // Group by category
  const byCategory = new Map<string, Map<string, number>>();
  for (const e of expenses) {
    if (!byCategory.has(e.category)) byCategory.set(e.category, new Map());
    byCategory.get(e.category)!.set(e.month, e.totalAmount);
  }

  const allMonths = [...new Set(expenses.map((e) => e.month))].sort();
  const previousMonths = allMonths.filter((m) => m < latestMonth);
  const previousMonth =
    previousMonths.length > 0 ? previousMonths[previousMonths.length - 1] : null;

  // Total current expense
  const totalCurrentExpense = expenses
    .filter((e) => e.month === latestMonth)
    .reduce((s, e) => s + e.totalAmount, 0);

  // Total previous month expense
  const totalPreviousMonthExpense = previousMonth
    ? expenses.filter((e) => e.month === previousMonth).reduce((s, e) => s + e.totalAmount, 0)
    : null;

  const totalChangeRate =
    totalPreviousMonthExpense != null && totalPreviousMonthExpense > 0
      ? ((totalCurrentExpense - totalPreviousMonthExpense) / totalPreviousMonthExpense) * 100
      : null;

  const categories: CategoryComparison[] = [];
  const newCategories: string[] = [];

  for (const [category, monthData] of byCategory) {
    const currentAmount = monthData.get(latestMonth) ?? 0;
    const prevMonthsForCat = allMonths.filter((m) => m < latestMonth);

    if (prevMonthsForCat.length === 0 && currentAmount > 0) {
      newCategories.push(category);
    }

    // 3-month average
    const prev3Months = prevMonthsForCat.slice(-3);
    const prev3Values = prev3Months.map((m) => monthData.get(m) ?? 0);
    const threeMonthAvg = prev3Values.length >= 3 ? calcAverage(prev3Values) : null;

    // 6-month average
    const prev6Months = prevMonthsForCat.slice(-6);
    const prev6Values = prev6Months.map((m) => monthData.get(m) ?? 0);
    const sixMonthAvg = prev6Values.length >= 6 ? calcAverage(prev6Values) : null;

    // Deviation
    const deviationFromThreeMonth = threeMonthAvg != null ? currentAmount - threeMonthAvg : null;
    const deviationFromThreeMonthPct =
      threeMonthAvg != null && threeMonthAvg !== 0
        ? ((currentAmount - threeMonthAvg) / threeMonthAvg) * 100
        : null;
    const deviationFromSixMonth = sixMonthAvg != null ? currentAmount - sixMonthAvg : null;
    const deviationFromSixMonthPct =
      sixMonthAvg != null && sixMonthAvg !== 0
        ? ((currentAmount - sixMonthAvg) / sixMonthAvg) * 100
        : null;

    // Severity
    let severity: "normal" | "elevated" | "anomalous" = "normal";
    if (prev3Values.length >= 3) {
      const mean = calcAverage(prev3Values);
      const std = calcStdDev(prev3Values, mean);
      if (std > 0) {
        const zScore = Math.abs(currentAmount - mean) / std;
        if (zScore > 2) severity = "anomalous";
        else if (zScore > 1) severity = "elevated";
      } else if (currentAmount !== mean) {
        severity = currentAmount > mean ? "elevated" : "normal";
      }
    }

    // Category trend direction (slope over available months)
    const allCatValues = allMonths.map((m) => monthData.get(m) ?? 0);
    let trendDirection: CategoryComparison["trendDirection"] = "unknown";
    if (allCatValues.length >= 3) {
      const slope = calcLinearSlope(allCatValues);
      const mean = calcAverage(allCatValues);
      const threshold = mean * 0.03;
      if (slope > threshold) trendDirection = "increasing";
      else if (slope < -threshold) trendDirection = "decreasing";
      else trendDirection = "stable";
    }

    // Proportion of total
    const proportionOfTotal =
      totalCurrentExpense > 0 ? (currentAmount / totalCurrentExpense) * 100 : 0;

    const prevAmount = previousMonth ? (monthData.get(previousMonth) ?? 0) : null;
    const previousProportionOfTotal =
      prevAmount != null && totalPreviousMonthExpense != null && totalPreviousMonthExpense > 0
        ? (prevAmount / totalPreviousMonthExpense) * 100
        : null;

    categories.push({
      category,
      currentAmount,
      threeMonthAvg,
      sixMonthAvg,
      deviationFromThreeMonth,
      deviationFromThreeMonthPct,
      deviationFromSixMonth,
      deviationFromSixMonthPct,
      severity,
      trendDirection,
      proportionOfTotal,
      previousProportionOfTotal,
    });
  }

  categories.sort((a, b) => {
    const severityOrder = { anomalous: 0, elevated: 1, normal: 2 };
    const diff = severityOrder[a.severity] - severityOrder[b.severity];
    if (diff !== 0) return diff;
    return Math.abs(b.deviationFromThreeMonth ?? 0) - Math.abs(a.deviationFromThreeMonth ?? 0);
  });

  // Top increasing/decreasing vs 3-month average
  const withDev = categories.filter((c) => c.deviationFromThreeMonth != null);
  const topIncreasing = withDev
    .filter((c) => c.deviationFromThreeMonth! > 0)
    .sort((a, b) => b.deviationFromThreeMonth! - a.deviationFromThreeMonth!)
    .slice(0, 3)
    .map((c) => ({
      category: c.category,
      diff: c.deviationFromThreeMonth!,
      diffPct: c.deviationFromThreeMonthPct!,
    }));
  const topDecreasing = withDev
    .filter((c) => c.deviationFromThreeMonth! < 0)
    .sort((a, b) => a.deviationFromThreeMonth! - b.deviationFromThreeMonth!)
    .slice(0, 3)
    .map((c) => ({
      category: c.category,
      diff: c.deviationFromThreeMonth!,
      diffPct: c.deviationFromThreeMonthPct!,
    }));

  return {
    categories,
    newCategories,
    totalCurrentExpense,
    totalPreviousMonthExpense,
    totalChangeRate,
    anomalousCount: categories.filter((c) => c.severity === "anomalous").length,
    elevatedCount: categories.filter((c) => c.severity === "elevated").length,
    topIncreasing,
    topDecreasing,
  };
}
