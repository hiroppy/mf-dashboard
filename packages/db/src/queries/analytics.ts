import { desc, eq } from "drizzle-orm";
import { getDb, type Db, schema } from "../index";
import {
  getHoldingsWithLatestValues,
  getTransactions,
  getAssetHistory,
  getLatestTotalAssets,
  getAssetBreakdownByCategory,
} from "../index";
import { resolveGroupId } from "../shared/group-filter";

// ============================================================================
// 型定義
// ============================================================================

export interface AnalyticsMetrics {
  savings: {
    totalAssets: number;
    liquidAssets: number;
    monthlyExpenseAvg: number;
    emergencyFundMonths: number;
  };
  investment: {
    holdings: Array<{
      name: string;
      amount: number;
      unrealizedGain: number;
      unrealizedGainPct: number;
    }>;
    totalInvestment: number;
    totalUnrealizedGain: number;
    totalUnrealizedGainPct: number;
    diversificationScore: number;
  };
  spending: {
    monthlyAverage: number;
    byCategory: Record<string, number>;
    topCategories: Array<{ category: string; amount: number; pct: number }>;
    anomalies: Array<{ category: string; amount: number; deviation: number }>;
  };
  growth: {
    monthlyGrowthRate: number;
    projectedAnnualRate: number;
    projections: Array<{ years: number; amount: number }>;
  };
  balance: {
    monthlyIncome: number;
    monthlyExpense: number;
    savingsRate: number;
    trend: Array<{ month: string; income: number; expense: number; balance: number }>;
  };
  liability: {
    totalLiabilities: number;
    byCategory: Array<{ category: string; amount: number; pct: number }>;
    debtToAssetRatio: number;
  };
  healthScore: {
    totalScore: number;
    categories: Array<{ name: string; score: number; maxScore: number }>;
  };
}

export interface AnalyticsInsights {
  summary: string | null;
  savings: string | null;
  investment: string | null;
  spending: string | null;
  balance: string | null;
  liability: string | null;
}

export interface AnalyticsReport {
  metrics: AnalyticsMetrics;
  insights: AnalyticsInsights | null;
  date: string | null;
  model: string | null;
}

// ============================================================================
// 定数
// ============================================================================

const LIQUID_ASSET_CATEGORIES = ["預金・現金・暗号資産", "電子マネー・プリペイド"];
const INVESTMENT_CATEGORIES = [
  "株式(現物)",
  "投資信託",
  "債券",
  "FX",
  "先物",
  "暗号資産・FX・貴金属",
];
const ANALYSIS_MONTHS = 12;

// ============================================================================
// データ収集
// ============================================================================

function getDateThreshold(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - ANALYSIS_MONTHS);
  return date.toISOString().split("T")[0];
}

interface CollectedData {
  totalAssets: number;
  liquidAssets: number;
  holdings: Array<{
    name: string;
    categoryName: string | null;
    amount: number;
    unrealizedGain: number | null;
    unrealizedGainPct: number | null;
  }>;
  liabilities: Array<{
    name: string;
    category: string;
    amount: number;
  }>;
  transactions: Array<{
    date: string;
    category: string | null;
    amount: number;
    type: string;
  }>;
  assetHistory: Array<{
    date: string;
    totalAssets: number;
    change: number;
  }>;
}

async function collectData(groupId: string, db: Db): Promise<CollectedData> {
  const dateThreshold = getDateThreshold();

  const holdingsRaw = await getHoldingsWithLatestValues(groupId, db);
  const transactionsRaw = await getTransactions({ groupId }, db);
  const assetHistoryRaw = await getAssetHistory({ groupId }, db);
  const totalAssets = (await getLatestTotalAssets(groupId, db)) ?? 0;
  const categoryBreakdown = await getAssetBreakdownByCategory(groupId, db);

  const liquidAssets = categoryBreakdown
    .filter((c) => LIQUID_ASSET_CATEGORIES.some((lc) => c.category.includes(lc)))
    .reduce((sum, c) => sum + c.amount, 0);

  const holdings = holdingsRaw
    .filter((h) => h.type !== "liability")
    .map((h) => ({
      name: h.name,
      categoryName: h.categoryName,
      amount: h.amount ?? 0,
      unrealizedGain: h.unrealizedGain,
      unrealizedGainPct: h.unrealizedGainPct,
    }));

  const liabilities = holdingsRaw
    .filter((h) => h.type === "liability")
    .map((h) => ({
      name: h.name,
      category: h.liabilityCategory ?? "その他",
      amount: h.amount ?? 0,
    }));

  const currentMonth = new Date().toISOString().slice(0, 7);
  const transactions = transactionsRaw
    .filter((t) => !t.isExcludedFromCalculation && t.date >= dateThreshold)
    .filter((t) => t.date.slice(0, 7) !== currentMonth)
    .map((t) => ({
      date: t.date,
      category: t.category,
      amount: t.amount,
      type: t.type,
    }));

  const assetHistory = assetHistoryRaw
    .filter((h) => h.date >= dateThreshold)
    .map((h) => ({
      date: h.date,
      totalAssets: h.totalAssets,
      change: h.change,
    }));

  return { totalAssets, liquidAssets, holdings, liabilities, transactions, assetHistory };
}

// ============================================================================
// Calculators
// ============================================================================

function countUniqueMonths(dates: string[]): number {
  const months = new Set(dates.map((d) => d.slice(0, 7)));
  return months.size;
}

function calculateSavings(data: CollectedData): AnalyticsMetrics["savings"] {
  const { totalAssets, liquidAssets, transactions } = data;
  const expenses = transactions.filter((t) => t.type === "expense");
  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
  const monthsCount = countUniqueMonths(expenses.map((t) => t.date));
  const monthlyExpenseAvg = monthsCount > 0 ? Math.round(totalExpenses / monthsCount) : 0;
  const emergencyFundMonths =
    monthlyExpenseAvg > 0 ? Math.round((liquidAssets / monthlyExpenseAvg) * 10) / 10 : 0;
  return { totalAssets, liquidAssets, monthlyExpenseAvg, emergencyFundMonths };
}

function isInvestmentCategory(categoryName: string): boolean {
  return INVESTMENT_CATEGORIES.some((c) => categoryName.includes(c) || c.includes(categoryName));
}

function calculateInvestment(data: CollectedData): AnalyticsMetrics["investment"] {
  const investmentHoldings = data.holdings.filter(
    (h) => h.categoryName && isInvestmentCategory(h.categoryName),
  );

  const holdings = investmentHoldings.map((h) => ({
    name: h.name,
    amount: h.amount,
    unrealizedGain: h.unrealizedGain ?? 0,
    unrealizedGainPct: h.unrealizedGainPct ?? 0,
  }));

  const totalInvestment = holdings.reduce((sum, h) => sum + h.amount, 0);
  const totalUnrealizedGain = holdings.reduce((sum, h) => sum + h.unrealizedGain, 0);
  const cost = totalInvestment - totalUnrealizedGain;
  const totalUnrealizedGainPct =
    cost > 0 ? Math.round((totalUnrealizedGain / cost) * 10000) / 100 : 0;

  const diversificationScore = calculateDiversificationScore(holdings);

  return {
    holdings,
    totalInvestment,
    totalUnrealizedGain,
    totalUnrealizedGainPct,
    diversificationScore,
  };
}

function calculateDiversificationScore(holdings: Array<{ amount: number }>): number {
  if (holdings.length === 0) return 0;
  if (holdings.length === 1) return 10;
  const totalAmount = holdings.reduce((sum, h) => sum + h.amount, 0);
  if (totalAmount === 0) return 0;
  const weights = holdings.map((h) => h.amount / totalAmount);
  const herfindahlIndex = weights.reduce((sum, w) => sum + w * w, 0);
  return Math.min(100, Math.max(0, Math.round((1 - herfindahlIndex) * 100)));
}

function calculateSpending(data: CollectedData): AnalyticsMetrics["spending"] {
  const { transactions } = data;
  const expenses = transactions.filter((t) => t.type === "expense");

  const byCategory: Record<string, number> = {};
  for (const expense of expenses) {
    const category = expense.category ?? "未分類";
    byCategory[category] = (byCategory[category] ?? 0) + expense.amount;
  }

  const totalExpenses = Object.values(byCategory).reduce((sum, v) => sum + v, 0);
  const monthsCount = countUniqueMonths(expenses.map((t) => t.date));
  const monthlyAverage = monthsCount > 0 ? Math.round(totalExpenses / monthsCount) : 0;

  const topCategories = Object.entries(byCategory)
    .map(([category, amount]) => ({
      category,
      amount: monthsCount > 0 ? Math.round(amount / monthsCount) : 0,
      pct: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const anomalies = detectAnomalies(transactions);

  return {
    monthlyAverage,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [
        k,
        monthsCount > 0 ? Math.round(v / monthsCount) : 0,
      ]),
    ),
    topCategories,
    anomalies,
  };
}

function detectAnomalies(
  transactions: CollectedData["transactions"],
): AnalyticsMetrics["spending"]["anomalies"] {
  const byMonthCategory: Record<string, Record<string, number>> = {};

  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const month = t.date.slice(0, 7);
    const category = t.category ?? "未分類";
    if (!byMonthCategory[month]) byMonthCategory[month] = {};
    byMonthCategory[month][category] = (byMonthCategory[month][category] ?? 0) + t.amount;
  }

  const months = Object.keys(byMonthCategory).sort();
  if (months.length < 3) return [];

  const latestMonth = months[months.length - 1];
  const previousMonths = months.slice(0, -1);

  const allCategories = new Set<string>();
  for (const month of previousMonths) {
    for (const category of Object.keys(byMonthCategory[month])) {
      allCategories.add(category);
    }
  }

  const categoryAverages: Record<string, { avg: number; stdDev: number }> = {};
  for (const category of allCategories) {
    const values = previousMonths.map((m) => byMonthCategory[m]?.[category] ?? 0);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
    categoryAverages[category] = { avg, stdDev: Math.sqrt(variance) };
  }

  const anomalies: Array<{ category: string; amount: number; deviation: number }> = [];
  const latestData = byMonthCategory[latestMonth] ?? {};

  for (const [category, amount] of Object.entries(latestData)) {
    const stats = categoryAverages[category];
    if (!stats || stats.stdDev === 0) continue;
    const deviation = (amount - stats.avg) / stats.stdDev;
    if (deviation > 2) {
      anomalies.push({ category, amount, deviation: Math.round(deviation * 100) / 100 });
    }
  }

  return anomalies.sort((a, b) => b.deviation - a.deviation).slice(0, 3);
}

function calculateLiability(data: CollectedData): AnalyticsMetrics["liability"] {
  const { liabilities, totalAssets } = data;
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.amount, 0);

  const byCategoryMap: Record<string, number> = {};
  for (const l of liabilities) {
    byCategoryMap[l.category] = (byCategoryMap[l.category] ?? 0) + l.amount;
  }

  const byCategory = Object.entries(byCategoryMap)
    .map(([category, amount]) => ({
      category,
      amount,
      pct: totalLiabilities > 0 ? Math.round((amount / totalLiabilities) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const debtToAssetRatio =
    totalAssets > 0 ? Math.round((totalLiabilities / totalAssets) * 1000) / 10 : 0;

  return { totalLiabilities, byCategory, debtToAssetRatio };
}

function calculateGrowth(data: CollectedData): AnalyticsMetrics["growth"] {
  const { assetHistory, totalAssets } = data;
  const years = [1, 3, 5];

  if (assetHistory.length < 2) {
    return {
      monthlyGrowthRate: 0,
      projectedAnnualRate: 0,
      projections: years.map((y) => ({ years: y, amount: totalAssets })),
    };
  }

  const sortedHistory = [...assetHistory].sort((a, b) => a.date.localeCompare(b.date));
  const first = sortedHistory[0];
  const last = sortedHistory[sortedHistory.length - 1];

  if (first.totalAssets <= 0) {
    return {
      monthlyGrowthRate: 0,
      projectedAnnualRate: 0,
      projections: years.map((y) => ({ years: y, amount: totalAssets })),
    };
  }

  const startDate = new Date(first.date);
  const endDate = new Date(last.date);
  const monthsDiff =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth());

  if (monthsDiff <= 0) {
    return {
      monthlyGrowthRate: 0,
      projectedAnnualRate: 0,
      projections: years.map((y) => ({ years: y, amount: totalAssets })),
    };
  }

  const monthlyGrowthRate =
    Math.round((Math.pow(last.totalAssets / first.totalAssets, 1 / monthsDiff) - 1) * 10000) /
    10000;

  if (Math.abs(monthlyGrowthRate) < 0.0001) {
    return {
      monthlyGrowthRate: 0,
      projectedAnnualRate: 0,
      projections: years.map((y) => ({ years: y, amount: totalAssets })),
    };
  }

  const annualRate = Math.pow(1 + monthlyGrowthRate, 12) - 1;
  const projectedAnnualRate = Math.round(annualRate * 1000) / 1000;

  return {
    monthlyGrowthRate,
    projectedAnnualRate,
    projections: years.map((y) => ({
      years: y,
      amount: Math.round(totalAssets * Math.pow(1 + annualRate, y)),
    })),
  };
}

function calculateBalance(data: CollectedData): AnalyticsMetrics["balance"] {
  const { transactions } = data;
  const byMonth: Record<string, { income: number; expense: number }> = {};

  for (const t of transactions) {
    const month = t.date.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { income: 0, expense: 0 };
    if (t.type === "income") {
      byMonth[month].income += t.amount;
    } else if (t.type === "expense") {
      byMonth[month].expense += t.amount;
    }
  }

  const trend = Object.entries(byMonth)
    .map(([month, { income, expense }]) => ({
      month,
      income,
      expense,
      balance: income - expense,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const totalIncome = trend.reduce((sum, m) => sum + m.income, 0);
  const totalExpense = trend.reduce((sum, m) => sum + m.expense, 0);
  const monthsCount = Math.max(1, trend.length);

  const monthlyIncome = Math.round(totalIncome / monthsCount);
  const monthlyExpense = Math.round(totalExpense / monthsCount);
  const savingsRate =
    monthlyIncome > 0
      ? Math.round(((monthlyIncome - monthlyExpense) / monthlyIncome) * 1000) / 10
      : 0;

  return { monthlyIncome, monthlyExpense, savingsRate, trend };
}

// ============================================================================
// Health Score
// ============================================================================

function lerp(value: number, min: number, max: number, outMin: number, outMax: number): number {
  if (max === min) return outMax;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return outMin + t * (outMax - outMin);
}

function scoreEmergencyFund(months: number): number {
  if (months >= 6) return 25;
  if (months <= 0) return 0;
  if (months <= 3) return Math.round(lerp(months, 0, 3, 0, 15));
  return Math.round(lerp(months, 3, 6, 15, 25));
}

function scoreSavingsRate(rate: number): number {
  if (rate >= 30) return 25;
  if (rate <= 0) return 0;
  if (rate <= 10) return Math.round(lerp(rate, 0, 10, 0, 8));
  if (rate <= 20) return Math.round(lerp(rate, 10, 20, 8, 17));
  return Math.round(lerp(rate, 20, 30, 17, 25));
}

function scoreDiversification(diversificationScore: number): number {
  return Math.round((Math.max(0, Math.min(100, diversificationScore)) / 100) * 20);
}

function scoreGrowth(monthlyGrowthRate: number): number {
  if (monthlyGrowthRate >= 0.02) return 15;
  if (monthlyGrowthRate <= -0.02) return 0;
  return Math.round(lerp(monthlyGrowthRate, -0.02, 0.02, 0, 15));
}

function scoreSpendingStability(anomalyCount: number): number {
  if (anomalyCount === 0) return 15;
  if (anomalyCount === 1) return 10;
  if (anomalyCount === 2) return 5;
  return 0;
}

export function calculateHealthScore(
  metrics: Omit<AnalyticsMetrics, "healthScore">,
): AnalyticsMetrics["healthScore"] {
  const categories = [
    {
      name: "緊急予備資金",
      score: scoreEmergencyFund(metrics.savings.emergencyFundMonths),
      maxScore: 25,
    },
    {
      name: "貯蓄率",
      score: scoreSavingsRate(metrics.balance.savingsRate),
      maxScore: 25,
    },
    {
      name: "投資分散度",
      score: scoreDiversification(metrics.investment.diversificationScore),
      maxScore: 20,
    },
    {
      name: "資産成長",
      score: scoreGrowth(metrics.growth.monthlyGrowthRate),
      maxScore: 15,
    },
    {
      name: "支出安定性",
      score: scoreSpendingStability(metrics.spending.anomalies.length),
      maxScore: 15,
    },
  ];
  const totalScore = categories.reduce((sum, c) => sum + c.score, 0);
  return { totalScore, categories };
}

// ============================================================================
// メトリクス統合
// ============================================================================

function computeMetrics(data: CollectedData): AnalyticsMetrics {
  const savings = calculateSavings(data);
  const investment = calculateInvestment(data);
  const spending = calculateSpending(data);
  const growth = calculateGrowth(data);
  const balance = calculateBalance(data);
  const liability = calculateLiability(data);
  const healthScore = calculateHealthScore({
    savings,
    investment,
    spending,
    growth,
    balance,
    liability,
  });
  return { savings, investment, spending, growth, balance, liability, healthScore };
}

// ============================================================================
// Query functions
// ============================================================================

export async function getFinancialMetrics(
  groupIdParam?: string,
  db: Db = getDb(),
): Promise<AnalyticsMetrics | null> {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return null;

  const data = await collectData(groupId, db);
  return computeMetrics(data);
}

export async function getLatestAnalytics(
  groupIdParam?: string,
  db: Db = getDb(),
): Promise<AnalyticsReport | null> {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return null;

  const data = await collectData(groupId, db);
  // 生データが全くない場合はnull
  if (
    data.totalAssets === 0 &&
    data.holdings.length === 0 &&
    data.liabilities.length === 0 &&
    data.transactions.length === 0 &&
    data.assetHistory.length === 0
  ) {
    return null;
  }

  const metrics = computeMetrics(data);

  // DB から LLM insights を取得
  const dbReport = await db
    .select()
    .from(schema.analyticsReports)
    .where(eq(schema.analyticsReports.groupId, groupId))
    .orderBy(desc(schema.analyticsReports.date))
    .limit(1)
    .get();

  const insights: AnalyticsInsights | null = dbReport
    ? {
        summary: dbReport.summary,
        savings: dbReport.savingsInsight,
        investment: dbReport.investmentInsight,
        spending: dbReport.spendingInsight,
        balance: dbReport.balanceInsight,
        liability: dbReport.liabilityInsight,
      }
    : null;

  return {
    metrics,
    insights,
    date: dbReport?.date ?? null,
    model: dbReport?.model ?? null,
  };
}
