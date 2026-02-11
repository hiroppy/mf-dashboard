export interface MonthlySummary {
  month: string;
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
}

export interface MonthComparison {
  month: string;
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  savingsRate: number;
  incomeDiff: number | null;
  expenseDiff: number | null;
  netIncomeDiff: number | null;
  incomeChangeRate: number | null;
  expenseChangeRate: number | null;
  netIncomeChangeRate: number | null;
}

export interface MoMTrendResult {
  latestMonthPartial: boolean;
  monthlyComparisons: MonthComparison[];
  streaks: {
    incomeStreak: { direction: "increasing" | "decreasing" | "none"; months: number };
    expenseStreak: { direction: "increasing" | "decreasing" | "none"; months: number };
    netIncomeStreak: { direction: "increasing" | "decreasing" | "none"; months: number };
    savingsRateStreak: { direction: "increasing" | "decreasing" | "none"; months: number };
  };
  overallTrend: "improving" | "worsening" | "stable";
  acceleration: "accelerating" | "decelerating" | "steady";
  bestMonth: { month: string; netIncome: number } | null;
  worstMonth: { month: string; netIncome: number } | null;
  threeMonthAvg: { income: number; expense: number; netIncome: number; savingsRate: number } | null;
  sixMonthAvg: { income: number; expense: number; netIncome: number; savingsRate: number } | null;
  latestVsThreeMonthAvg: {
    incomeDiff: number;
    incomeDiffPct: number;
    expenseDiff: number;
    expenseDiffPct: number;
    netIncomeDiff: number;
  } | null;
}

export interface CategoryTotal {
  month: string;
  category: string;
  type: "income" | "expense";
  totalAmount: number;
}

export interface CategoryComparison {
  category: string;
  currentAmount: number;
  threeMonthAvg: number | null;
  sixMonthAvg: number | null;
  deviationFromThreeMonth: number | null;
  deviationFromThreeMonthPct: number | null;
  deviationFromSixMonth: number | null;
  deviationFromSixMonthPct: number | null;
  severity: "normal" | "elevated" | "anomalous";
  trendDirection: "increasing" | "decreasing" | "stable" | "unknown";
  proportionOfTotal: number;
  previousProportionOfTotal: number | null;
}

export interface SpendingComparisonResult {
  categories: CategoryComparison[];
  newCategories: string[];
  totalCurrentExpense: number;
  totalPreviousMonthExpense: number | null;
  totalChangeRate: number | null;
  anomalousCount: number;
  elevatedCount: number;
  topIncreasing: Array<{ category: string; diff: number; diffPct: number }>;
  topDecreasing: Array<{ category: string; diff: number; diffPct: number }>;
}

export interface HoldingInfo {
  name: string;
  amount: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
}

export interface DailyChangeInfo {
  name: string;
  dailyChange: number;
}

export interface PortfolioRiskResult {
  topConcentration: { names: string[]; totalPct: number };
  maxHolding: { name: string; pct: number } | null;
  volatileHoldings: Array<{ name: string; dailyChange: number; portfolioImpactPct: number }>;
  riskLevel: "low" | "moderate" | "high";
  maxGainHolding: { name: string; unrealizedGain: number; unrealizedGainPct: number } | null;
  maxLossHolding: { name: string; unrealizedGain: number; unrealizedGainPct: number } | null;
  totalDailyChange: number;
  totalDailyChangePct: number;
  holdingsCount: number;
  positiveCount: number;
  negativeCount: number;
  totalUnrealizedGain: number;
  totalUnrealizedGainPct: number;
}

export interface SavingsInput {
  totalAssets: number;
  liquidAssets: number;
  monthlyExpenseAvg: number;
  emergencyFundMonths: number;
}

export interface SavingsTrajectoryResult {
  currentEmergencyFundMonths: number;
  previousEmergencyFundMonths: number | null;
  emergencyFundChange: number | null;
  direction: "improving" | "declining" | "stable";
  primaryFactor:
    | "expense_increase"
    | "expense_decrease"
    | "asset_increase"
    | "asset_decrease"
    | "mixed";
  monthsToSixMonthTarget: number | null;
  savingsRateHistory: Array<{ month: string; savingsRate: number }>;
  averageSavingsRate: number;
  savingsRateTrend: "improving" | "declining" | "stable";
  cumulativeNetIncome: number;
  liquidAssetsToTotalRatio: number;
}

export interface IncomeStabilityResult {
  mean: number;
  median: number;
  stdDev: number;
  coefficientOfVariation: number;
  stability: "very_stable" | "stable" | "variable" | "highly_variable";
  outlierMonths: Array<{
    month: string;
    income: number;
    deviationFromMean: number;
    deviationPct: number;
  }>;
  trend: "increasing" | "decreasing" | "flat";
  trendSlopePerMonth: number;
  minMonth: { month: string; income: number } | null;
  maxMonth: { month: string; income: number } | null;
  latestVsMean: { diff: number; diffPct: number } | null;
}
