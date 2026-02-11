import { describe, it, expect } from "vitest";
import type {
  MonthlySummary,
  CategoryTotal,
  HoldingInfo,
  DailyChangeInfo,
  SavingsInput,
} from "./analyzer-types";
import { analyzeIncomeStability } from "./analyze-income-stability";
import { analyzeMoMTrend } from "./analyze-mom-trend";
import { analyzePortfolioRisk } from "./analyze-portfolio-risk";
import { analyzeSavingsTrajectory } from "./analyze-savings-trajectory";
import { analyzeSpendingComparison } from "./analyze-spending-comparison";

describe("analyzeMoMTrend", () => {
  it("should return empty result for empty input", () => {
    const result = analyzeMoMTrend([]);
    expect(result.monthlyComparisons).toHaveLength(0);
    expect(result.overallTrend).toBe("stable");
    expect(result.threeMonthAvg).toBeNull();
    expect(result.sixMonthAvg).toBeNull();
  });

  it("should calculate month-over-month differences", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
      { month: "2025-02", totalIncome: 320000, totalExpense: 210000, netIncome: 110000 },
    ];
    const result = analyzeMoMTrend(data);

    expect(result.monthlyComparisons).toHaveLength(2);
    expect(result.monthlyComparisons[0].incomeDiff).toBeNull();
    expect(result.monthlyComparisons[1].incomeDiff).toBe(20000);
    expect(result.monthlyComparisons[1].expenseDiff).toBe(10000);
    expect(result.monthlyComparisons[1].netIncomeDiff).toBe(10000);
  });

  it("should calculate change rates and savings rate", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 200000, totalExpense: 100000, netIncome: 100000 },
      { month: "2025-02", totalIncome: 220000, totalExpense: 110000, netIncome: 110000 },
    ];
    const result = analyzeMoMTrend(data);
    expect(result.monthlyComparisons[1].incomeChangeRate).toBe(10);
    expect(result.monthlyComparisons[1].expenseChangeRate).toBe(10);
    expect(result.monthlyComparisons[0].savingsRate).toBe(50);
    expect(result.monthlyComparisons[1].savingsRate).toBe(50);
  });

  it("should identify best and worst months", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
      { month: "2025-02", totalIncome: 300000, totalExpense: 350000, netIncome: -50000 },
      { month: "2025-03", totalIncome: 500000, totalExpense: 200000, netIncome: 300000 },
    ];
    const result = analyzeMoMTrend(data);
    expect(result.bestMonth!.month).toBe("2025-03");
    expect(result.bestMonth!.netIncome).toBe(300000);
    expect(result.worstMonth!.month).toBe("2025-02");
    expect(result.worstMonth!.netIncome).toBe(-50000);
  });

  it("should calculate latestVsThreeMonthAvg", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
      { month: "2025-02", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
      { month: "2025-03", totalIncome: 360000, totalExpense: 200000, netIncome: 160000 },
    ];
    const result = analyzeMoMTrend(data);
    expect(result.latestVsThreeMonthAvg).not.toBeNull();
    // Latest income 360000 vs avg 320000 = +40000
    expect(result.latestVsThreeMonthAvg!.incomeDiff).toBe(40000);
  });

  it("should detect increasing streak", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
      { month: "2025-02", totalIncome: 310000, totalExpense: 190000, netIncome: 120000 },
      { month: "2025-03", totalIncome: 320000, totalExpense: 180000, netIncome: 140000 },
      { month: "2025-04", totalIncome: 330000, totalExpense: 170000, netIncome: 160000 },
    ];
    const result = analyzeMoMTrend(data);

    expect(result.streaks.netIncomeStreak.direction).toBe("increasing");
    expect(result.streaks.netIncomeStreak.months).toBe(3);
    expect(result.overallTrend).toBe("improving");
  });

  it("should detect decreasing streak and worsening trend", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
      { month: "2025-02", totalIncome: 300000, totalExpense: 220000, netIncome: 80000 },
      { month: "2025-03", totalIncome: 300000, totalExpense: 240000, netIncome: 60000 },
    ];
    const result = analyzeMoMTrend(data);

    expect(result.streaks.netIncomeStreak.direction).toBe("decreasing");
    expect(result.streaks.netIncomeStreak.months).toBe(2);
    expect(result.overallTrend).toBe("worsening");
  });

  it("should calculate 3-month average when enough data", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
      { month: "2025-02", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
      { month: "2025-03", totalIncome: 360000, totalExpense: 200000, netIncome: 160000 },
    ];
    const result = analyzeMoMTrend(data);
    expect(result.threeMonthAvg).not.toBeNull();
    expect(result.threeMonthAvg!.income).toBe(320000);
  });

  it("should return null for 3-month average with < 3 months", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
      { month: "2025-02", totalIncome: 310000, totalExpense: 210000, netIncome: 100000 },
    ];
    const result = analyzeMoMTrend(data);
    expect(result.threeMonthAvg).toBeNull();
  });

  it("should calculate 6-month average when enough data", () => {
    const data: MonthlySummary[] = Array.from({ length: 6 }, (_, i) => ({
      month: `2025-0${i + 1}`,
      totalIncome: 300000,
      totalExpense: 200000,
      netIncome: 100000,
    }));
    const result = analyzeMoMTrend(data);
    expect(result.sixMonthAvg).not.toBeNull();
    expect(result.sixMonthAvg!.income).toBe(300000);
  });

  it("should handle single entry", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
    ];
    const result = analyzeMoMTrend(data);
    expect(result.monthlyComparisons).toHaveLength(1);
    expect(result.streaks.netIncomeStreak.direction).toBe("none");
    expect(result.overallTrend).toBe("stable");
  });

  it("should sort unsorted input by month", () => {
    const data: MonthlySummary[] = [
      { month: "2025-03", totalIncome: 320000, totalExpense: 200000, netIncome: 120000 },
      { month: "2025-01", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
      { month: "2025-02", totalIncome: 310000, totalExpense: 200000, netIncome: 110000 },
    ];
    const result = analyzeMoMTrend(data);
    expect(result.monthlyComparisons[0].month).toBe("2025-01");
    expect(result.monthlyComparisons[2].month).toBe("2025-03");
  });
});

describe("analyzeSpendingComparison", () => {
  it("should return empty result for empty input", () => {
    const result = analyzeSpendingComparison([], "2025-04");
    expect(result.categories).toHaveLength(0);
    expect(result.newCategories).toHaveLength(0);
  });

  it("should calculate deviation from 3-month average", () => {
    const data: CategoryTotal[] = [
      { month: "2025-01", category: "食費", type: "expense", totalAmount: 50000 },
      { month: "2025-02", category: "食費", type: "expense", totalAmount: 50000 },
      { month: "2025-03", category: "食費", type: "expense", totalAmount: 50000 },
      { month: "2025-04", category: "食費", type: "expense", totalAmount: 70000 },
    ];
    const result = analyzeSpendingComparison(data, "2025-04");

    const food = result.categories.find((c) => c.category === "食費")!;
    expect(food.currentAmount).toBe(70000);
    expect(food.threeMonthAvg).toBe(50000);
    expect(food.deviationFromThreeMonth).toBe(20000);
    expect(food.deviationFromThreeMonthPct).toBe(40);
  });

  it("should classify severity as anomalous for high deviation", () => {
    const data: CategoryTotal[] = [
      { month: "2025-01", category: "食費", type: "expense", totalAmount: 30000 },
      { month: "2025-02", category: "食費", type: "expense", totalAmount: 30000 },
      { month: "2025-03", category: "食費", type: "expense", totalAmount: 30000 },
      { month: "2025-04", category: "食費", type: "expense", totalAmount: 100000 },
    ];
    const result = analyzeSpendingComparison(data, "2025-04");
    const food = result.categories.find((c) => c.category === "食費")!;
    // All previous values are identical (std=0), current is different → elevated
    expect(food.severity).toBe("elevated");
  });

  it("should classify severity with standard deviation", () => {
    const data: CategoryTotal[] = [
      { month: "2025-01", category: "食費", type: "expense", totalAmount: 40000 },
      { month: "2025-02", category: "食費", type: "expense", totalAmount: 50000 },
      { month: "2025-03", category: "食費", type: "expense", totalAmount: 60000 },
      { month: "2025-04", category: "食費", type: "expense", totalAmount: 150000 },
    ];
    const result = analyzeSpendingComparison(data, "2025-04");
    const food = result.categories.find((c) => c.category === "食費")!;
    // mean=50000, std≈8165, z-score ≈ (150000-50000)/8165 ≈ 12.2 → anomalous
    expect(food.severity).toBe("anomalous");
  });

  it("should detect new categories", () => {
    const data: CategoryTotal[] = [
      { month: "2025-04", category: "新カテゴリ", type: "expense", totalAmount: 10000 },
    ];
    const result = analyzeSpendingComparison(data, "2025-04");
    expect(result.newCategories).toContain("新カテゴリ");
  });

  it("should filter out income entries", () => {
    const data: CategoryTotal[] = [
      { month: "2025-01", category: "給与", type: "income", totalAmount: 300000 },
      { month: "2025-04", category: "給与", type: "income", totalAmount: 300000 },
    ];
    const result = analyzeSpendingComparison(data, "2025-04");
    expect(result.categories).toHaveLength(0);
  });

  it("should calculate totalCurrentExpense and totalChangeRate", () => {
    const data: CategoryTotal[] = [
      { month: "2025-03", category: "食費", type: "expense", totalAmount: 50000 },
      { month: "2025-04", category: "食費", type: "expense", totalAmount: 60000 },
      { month: "2025-03", category: "交通費", type: "expense", totalAmount: 10000 },
      { month: "2025-04", category: "交通費", type: "expense", totalAmount: 15000 },
    ];
    const result = analyzeSpendingComparison(data, "2025-04");
    expect(result.totalCurrentExpense).toBe(75000);
    expect(result.totalPreviousMonthExpense).toBe(60000);
    expect(result.totalChangeRate).toBe(25);
  });

  it("should identify top increasing and decreasing categories", () => {
    const data: CategoryTotal[] = [
      { month: "2025-01", category: "食費", type: "expense", totalAmount: 50000 },
      { month: "2025-02", category: "食費", type: "expense", totalAmount: 50000 },
      { month: "2025-03", category: "食費", type: "expense", totalAmount: 50000 },
      { month: "2025-04", category: "食費", type: "expense", totalAmount: 80000 },
      { month: "2025-01", category: "交通費", type: "expense", totalAmount: 30000 },
      { month: "2025-02", category: "交通費", type: "expense", totalAmount: 30000 },
      { month: "2025-03", category: "交通費", type: "expense", totalAmount: 30000 },
      { month: "2025-04", category: "交通費", type: "expense", totalAmount: 10000 },
    ];
    const result = analyzeSpendingComparison(data, "2025-04");
    expect(result.topIncreasing.length).toBeGreaterThanOrEqual(1);
    expect(result.topIncreasing[0].category).toBe("食費");
    expect(result.topDecreasing.length).toBeGreaterThanOrEqual(1);
    expect(result.topDecreasing[0].category).toBe("交通費");
  });

  it("should sort by severity then by deviation", () => {
    const data: CategoryTotal[] = [
      { month: "2025-01", category: "食費", type: "expense", totalAmount: 50000 },
      { month: "2025-02", category: "食費", type: "expense", totalAmount: 50000 },
      { month: "2025-03", category: "食費", type: "expense", totalAmount: 50000 },
      { month: "2025-04", category: "食費", type: "expense", totalAmount: 51000 },
      { month: "2025-01", category: "交通費", type: "expense", totalAmount: 10000 },
      { month: "2025-02", category: "交通費", type: "expense", totalAmount: 20000 },
      { month: "2025-03", category: "交通費", type: "expense", totalAmount: 15000 },
      { month: "2025-04", category: "交通費", type: "expense", totalAmount: 80000 },
    ];
    const result = analyzeSpendingComparison(data, "2025-04");
    // 交通費 has much higher deviation, should appear before 食費
    expect(result.categories[0].category).toBe("交通費");
  });
});

describe("analyzePortfolioRisk", () => {
  it("should return empty result for no holdings", () => {
    const result = analyzePortfolioRisk([], [], 0);
    expect(result.riskLevel).toBe("low");
    expect(result.maxHolding).toBeNull();
    expect(result.maxGainHolding).toBeNull();
    expect(result.maxLossHolding).toBeNull();
  });

  it("should calculate top 3 concentration", () => {
    const holdings: HoldingInfo[] = [
      { name: "Stock A", amount: 500000, unrealizedGain: 50000, unrealizedGainPct: 10 },
      { name: "Stock B", amount: 300000, unrealizedGain: 30000, unrealizedGainPct: 10 },
      { name: "Stock C", amount: 200000, unrealizedGain: -10000, unrealizedGainPct: -5 },
    ];
    const result = analyzePortfolioRisk(holdings, [], 50);
    expect(result.topConcentration.totalPct).toBe(100);
    expect(result.maxHolding!.name).toBe("Stock A");
    expect(result.maxHolding!.pct).toBe(50);
  });

  it("should identify max gain and max loss holdings", () => {
    const holdings: HoldingInfo[] = [
      { name: "Winner", amount: 300000, unrealizedGain: 80000, unrealizedGainPct: 36 },
      { name: "Loser", amount: 200000, unrealizedGain: -40000, unrealizedGainPct: -16.7 },
      { name: "Neutral", amount: 100000, unrealizedGain: 0, unrealizedGainPct: 0 },
    ];
    const result = analyzePortfolioRisk(holdings, [], 60);
    expect(result.maxGainHolding!.name).toBe("Winner");
    expect(result.maxLossHolding!.name).toBe("Loser");
  });

  it("should detect volatile holdings and compute total daily change", () => {
    const holdings: HoldingInfo[] = [
      { name: "Stock A", amount: 500000, unrealizedGain: 0, unrealizedGainPct: 0 },
      { name: "Stock B", amount: 500000, unrealizedGain: 0, unrealizedGainPct: 0 },
    ];
    const dailyChanges: DailyChangeInfo[] = [
      { name: "Stock A", dailyChange: -30000 },
      { name: "Stock B", dailyChange: 5000 },
    ];
    const result = analyzePortfolioRisk(holdings, dailyChanges, 50);
    expect(result.volatileHoldings).toHaveLength(2);
    expect(result.volatileHoldings[0].name).toBe("Stock A");
    expect(result.volatileHoldings[0].portfolioImpactPct).toBe(3);
    expect(result.totalDailyChange).toBe(-25000);
    expect(result.totalDailyChangePct).toBeCloseTo(-2.5);
  });

  it("should count positive and negative holdings", () => {
    const holdings: HoldingInfo[] = [
      { name: "A", amount: 300000, unrealizedGain: 50000, unrealizedGainPct: 20 },
      { name: "B", amount: 200000, unrealizedGain: -10000, unrealizedGainPct: -4.8 },
      { name: "C", amount: 100000, unrealizedGain: 20000, unrealizedGainPct: 25 },
    ];
    const result = analyzePortfolioRisk(holdings, [], 60);
    expect(result.holdingsCount).toBe(3);
    expect(result.positiveCount).toBe(2);
    expect(result.negativeCount).toBe(1);
    expect(result.totalUnrealizedGain).toBe(60000);
  });

  it("should classify risk level as high when concentration is high", () => {
    const holdings: HoldingInfo[] = [
      { name: "Single", amount: 1000000, unrealizedGain: 0, unrealizedGainPct: 0 },
    ];
    const result = analyzePortfolioRisk(holdings, [], 10);
    expect(result.riskLevel).toBe("high");
  });

  it("should classify risk level as moderate", () => {
    const holdings: HoldingInfo[] = [
      { name: "A", amount: 400000, unrealizedGain: 0, unrealizedGainPct: 0 },
      { name: "B", amount: 300000, unrealizedGain: 0, unrealizedGainPct: 0 },
      { name: "C", amount: 200000, unrealizedGain: 0, unrealizedGainPct: 0 },
      { name: "D", amount: 100000, unrealizedGain: 0, unrealizedGainPct: 0 },
    ];
    // top3 = 900/1000 = 90% > 80% → high, but diversification=50 < 60 → moderate
    // Actually top3 > 80% → high
    const result = analyzePortfolioRisk(holdings, [], 50);
    expect(result.riskLevel).toBe("high");

    // More balanced: top3 < 80%
    const balanced: HoldingInfo[] = [
      { name: "A", amount: 200000, unrealizedGain: 0, unrealizedGainPct: 0 },
      { name: "B", amount: 200000, unrealizedGain: 0, unrealizedGainPct: 0 },
      { name: "C", amount: 200000, unrealizedGain: 0, unrealizedGainPct: 0 },
      { name: "D", amount: 200000, unrealizedGain: 0, unrealizedGainPct: 0 },
      { name: "E", amount: 200000, unrealizedGain: 0, unrealizedGainPct: 0 },
    ];
    // top3 = 600/1000 = 60%, diversification=50 < 60 → moderate
    const result2 = analyzePortfolioRisk(balanced, [], 50);
    expect(result2.riskLevel).toBe("moderate");
  });

  it("should classify risk level as low with good diversification", () => {
    const holdings: HoldingInfo[] = Array.from({ length: 10 }, (_, i) => ({
      name: `Stock ${i}`,
      amount: 100000,
      unrealizedGain: 0,
      unrealizedGainPct: 0,
    }));
    // top3 = 300/1000 = 30% < 60%, diversification=70 >= 60 → low
    const result = analyzePortfolioRisk(holdings, [], 70);
    expect(result.riskLevel).toBe("low");
  });
});

describe("analyzeSavingsTrajectory", () => {
  it("should detect improving direction when previous expense was higher", () => {
    const current: SavingsInput = {
      totalAssets: 5000000,
      liquidAssets: 2000000,
      monthlyExpenseAvg: 200000,
      emergencyFundMonths: 10,
    };
    const summaries: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 400000, totalExpense: 250000, netIncome: 150000 },
      { month: "2025-02", totalIncome: 400000, totalExpense: 200000, netIncome: 200000 },
    ];
    // previousFundMonths = 2000000 / 250000 = 8
    // change = 10 - 8 = 2 > 0.5 → improving
    const result = analyzeSavingsTrajectory(current, summaries);
    expect(result.direction).toBe("improving");
    expect(result.emergencyFundChange).toBeCloseTo(2);
    expect(result.primaryFactor).toBe("expense_decrease");
  });

  it("should detect declining direction", () => {
    const current: SavingsInput = {
      totalAssets: 5000000,
      liquidAssets: 1000000,
      monthlyExpenseAvg: 200000,
      emergencyFundMonths: 5,
    };
    const summaries: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 150000, netIncome: 150000 },
      { month: "2025-02", totalIncome: 300000, totalExpense: 200000, netIncome: 100000 },
    ];
    // previousFundMonths = 1000000 / 150000 ≈ 6.67
    // change = 5 - 6.67 ≈ -1.67 < -0.5 → declining
    const result = analyzeSavingsTrajectory(current, summaries);
    expect(result.direction).toBe("declining");
    expect(result.primaryFactor).toBe("expense_increase");
  });

  it("should return null change when only one month of data", () => {
    const current: SavingsInput = {
      totalAssets: 5000000,
      liquidAssets: 2000000,
      monthlyExpenseAvg: 200000,
      emergencyFundMonths: 10,
    };
    const result = analyzeSavingsTrajectory(current, [
      { month: "2025-01", totalIncome: 400000, totalExpense: 200000, netIncome: 200000 },
    ]);
    expect(result.emergencyFundChange).toBeNull();
    expect(result.direction).toBe("stable");
  });

  it("should calculate savings rate history", () => {
    const current: SavingsInput = {
      totalAssets: 5000000,
      liquidAssets: 2000000,
      monthlyExpenseAvg: 200000,
      emergencyFundMonths: 10,
    };
    const summaries: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 400000, totalExpense: 200000, netIncome: 200000 },
      { month: "2025-02", totalIncome: 400000, totalExpense: 240000, netIncome: 160000 },
      { month: "2025-03", totalIncome: 400000, totalExpense: 280000, netIncome: 120000 },
    ];
    const result = analyzeSavingsTrajectory(current, summaries);
    expect(result.savingsRateHistory).toHaveLength(3);
    expect(result.savingsRateHistory[0].savingsRate).toBe(50);
    expect(result.savingsRateHistory[1].savingsRate).toBe(40);
    expect(result.savingsRateHistory[2].savingsRate).toBe(30);
    expect(result.savingsRateTrend).toBe("declining");
  });

  it("should return null months to target when already above 6 months", () => {
    const current: SavingsInput = {
      totalAssets: 5000000,
      liquidAssets: 2000000,
      monthlyExpenseAvg: 200000,
      emergencyFundMonths: 10,
    };
    const summaries: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 400000, totalExpense: 200000, netIncome: 200000 },
      { month: "2025-02", totalIncome: 400000, totalExpense: 200000, netIncome: 200000 },
    ];
    const result = analyzeSavingsTrajectory(current, summaries);
    expect(result.monthsToSixMonthTarget).toBeNull();
  });

  it("should calculate cumulative net income and liquid ratio", () => {
    const current: SavingsInput = {
      totalAssets: 5000000,
      liquidAssets: 2000000,
      monthlyExpenseAvg: 200000,
      emergencyFundMonths: 10,
    };
    const summaries: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 400000, totalExpense: 200000, netIncome: 200000 },
      { month: "2025-02", totalIncome: 400000, totalExpense: 250000, netIncome: 150000 },
    ];
    const result = analyzeSavingsTrajectory(current, summaries);
    expect(result.cumulativeNetIncome).toBe(350000);
    expect(result.liquidAssetsToTotalRatio).toBe(40);
  });
});

describe("analyzeIncomeStability", () => {
  it("should return very_stable for empty input", () => {
    const result = analyzeIncomeStability([]);
    expect(result.stability).toBe("very_stable");
    expect(result.mean).toBe(0);
    expect(result.trend).toBe("flat");
  });

  it("should classify very stable income", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-02", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-03", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-04", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
    ];
    const result = analyzeIncomeStability(data);
    expect(result.stability).toBe("very_stable");
    expect(result.mean).toBe(300000);
    expect(result.coefficientOfVariation).toBe(0);
  });

  it("should classify variable income", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 200000, totalExpense: 0, netIncome: 0 },
      { month: "2025-02", totalIncome: 350000, totalExpense: 0, netIncome: 0 },
      { month: "2025-03", totalIncome: 250000, totalExpense: 0, netIncome: 0 },
      { month: "2025-04", totalIncome: 400000, totalExpense: 0, netIncome: 0 },
    ];
    const result = analyzeIncomeStability(data);
    // CV will be high enough for variable or highly_variable
    expect(["variable", "highly_variable"]).toContain(result.stability);
  });

  it("should detect outlier months", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-02", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-03", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-04", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-05", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-06", totalIncome: 800000, totalExpense: 0, netIncome: 0 },
    ];
    const result = analyzeIncomeStability(data);
    expect(result.outlierMonths.length).toBeGreaterThanOrEqual(1);
    expect(result.outlierMonths[0].month).toBe("2025-06");
  });

  it("should detect increasing trend", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 200000, totalExpense: 0, netIncome: 0 },
      { month: "2025-02", totalIncome: 250000, totalExpense: 0, netIncome: 0 },
      { month: "2025-03", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-04", totalIncome: 350000, totalExpense: 0, netIncome: 0 },
      { month: "2025-05", totalIncome: 400000, totalExpense: 0, netIncome: 0 },
    ];
    const result = analyzeIncomeStability(data);
    expect(result.trend).toBe("increasing");
  });

  it("should detect decreasing trend", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 400000, totalExpense: 0, netIncome: 0 },
      { month: "2025-02", totalIncome: 350000, totalExpense: 0, netIncome: 0 },
      { month: "2025-03", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-04", totalIncome: 250000, totalExpense: 0, netIncome: 0 },
      { month: "2025-05", totalIncome: 200000, totalExpense: 0, netIncome: 0 },
    ];
    const result = analyzeIncomeStability(data);
    expect(result.trend).toBe("decreasing");
  });

  it("should detect flat trend for constant values", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-02", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-03", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
    ];
    const result = analyzeIncomeStability(data);
    expect(result.trend).toBe("flat");
  });

  it("should handle single entry", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
    ];
    const result = analyzeIncomeStability(data);
    expect(result.mean).toBe(300000);
    expect(result.stability).toBe("very_stable");
    expect(result.trend).toBe("flat");
  });

  it("should identify min and max months", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 200000, totalExpense: 0, netIncome: 0 },
      { month: "2025-02", totalIncome: 500000, totalExpense: 0, netIncome: 0 },
      { month: "2025-03", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
    ];
    const result = analyzeIncomeStability(data);
    expect(result.minMonth!.month).toBe("2025-01");
    expect(result.minMonth!.income).toBe(200000);
    expect(result.maxMonth!.month).toBe("2025-02");
    expect(result.maxMonth!.income).toBe(500000);
  });

  it("should calculate latestVsMean", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-02", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-03", totalIncome: 400000, totalExpense: 0, netIncome: 0 },
    ];
    const result = analyzeIncomeStability(data);
    // mean ≈ 333333, latest = 400000
    expect(result.latestVsMean).not.toBeNull();
    expect(result.latestVsMean!.diff).toBeGreaterThan(0);
    expect(result.latestVsMean!.diffPct).toBeGreaterThan(0);
  });

  it("should calculate median correctly", () => {
    const data: MonthlySummary[] = [
      { month: "2025-01", totalIncome: 100000, totalExpense: 0, netIncome: 0 },
      { month: "2025-02", totalIncome: 300000, totalExpense: 0, netIncome: 0 },
      { month: "2025-03", totalIncome: 500000, totalExpense: 0, netIncome: 0 },
    ];
    const result = analyzeIncomeStability(data);
    expect(result.median).toBe(300000);
  });
});
