import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InsightsSpendingCard } from "./insights-spending-card";

const meta = {
  title: "Info/InsightsSpendingCard",
  component: InsightsSpendingCard,
  tags: ["autodocs"],
} satisfies Meta<typeof InsightsSpendingCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseMetrics = {
  savings: { totalAssets: 0, liquidAssets: 0, monthlyExpenseAvg: 0, emergencyFundMonths: 0 },
  investment: {
    holdings: [],
    totalInvestment: 0,
    totalUnrealizedGain: 0,
    totalUnrealizedGainPct: 0,
    diversificationScore: 0,
  },
  spending: {
    monthlyAverage: 420_000,
    byCategory: { 食費: 80_000, 住居費: 120_000, 交通費: 30_000 },
    topCategories: [
      { category: "住居費", amount: 120_000, pct: 28.6 },
      { category: "食費", amount: 80_000, pct: 19.0 },
      { category: "交通費", amount: 30_000, pct: 7.1 },
    ],
    anomalies: [],
  },
  growth: { monthlyGrowthRate: 0, projectedAnnualRate: 0, projections: [] },
  balance: { monthlyIncome: 0, monthlyExpense: 0, savingsRate: 0, trend: [] },
  liability: { totalLiabilities: 0, byCategory: [], debtToAssetRatio: 0 },
  healthScore: { totalScore: 0, categories: [] },
};

export const Default: Story = {
  args: {
    metrics: baseMetrics,
    insights: {
      summary: null,
      savings: null,
      investment: null,
      spending: "住居費12万円（28.6%）が最大支出。食費8万円は3ヶ月平均比+15%（+1万円）で上昇傾向。",
      balance: null,
      liability: null,
    },
  },
};

export const WithAnomalies: Story = {
  name: "異常検出あり",
  args: {
    metrics: {
      ...baseMetrics,
      spending: {
        ...baseMetrics.spending,
        anomalies: [
          { category: "食費", amount: 120_000, deviation: 2.5 },
          { category: "交際費", amount: 50_000, deviation: 3.1 },
        ],
      },
    },
    insights: null,
  },
};

export const NoCategories: Story = {
  name: "カテゴリなし",
  args: {
    metrics: {
      ...baseMetrics,
      spending: {
        monthlyAverage: 0,
        byCategory: {},
        topCategories: [],
        anomalies: [],
      },
    },
    insights: null,
  },
};
