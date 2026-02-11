import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InsightsBalanceCard } from "./insights-balance-card";

const meta = {
  title: "Info/InsightsBalanceCard",
  component: InsightsBalanceCard,
  tags: ["autodocs"],
} satisfies Meta<typeof InsightsBalanceCard>;

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
  spending: { monthlyAverage: 0, byCategory: {}, topCategories: [], anomalies: [] },
  growth: { monthlyGrowthRate: 0, projectedAnnualRate: 0, projections: [] },
  liability: { totalLiabilities: 0, byCategory: [], debtToAssetRatio: 0 },
  balance: {
    monthlyIncome: 800_000,
    monthlyExpense: 420_000,
    savingsRate: 47.5,
    trend: [
      { month: "2025-10", income: 780_000, expense: 400_000, balance: 380_000 },
      { month: "2025-11", income: 810_000, expense: 430_000, balance: 380_000 },
      { month: "2025-12", income: 820_000, expense: 410_000, balance: 410_000 },
      { month: "2026-01", income: 800_000, expense: 440_000, balance: 360_000 },
    ],
  },
  healthScore: { totalScore: 0, categories: [] },
};

export const Default: Story = {
  args: {
    metrics: baseMetrics,
    insights: {
      summary: null,
      savings: null,
      investment: null,
      spending: null,
      balance:
        "月平均収入80万円に対し支出42万円で、貯蓄率47.5%は良好。直近月の純収入は36万円で3ヶ月平均38.3万円をやや下回る。",
      liability: null,
    },
  },
};

export const Deficit: Story = {
  name: "赤字",
  args: {
    metrics: {
      ...baseMetrics,
      balance: {
        monthlyIncome: 300_000,
        monthlyExpense: 420_000,
        savingsRate: -40.0,
        trend: [
          { month: "2025-12", income: 300_000, expense: 400_000, balance: -100_000 },
          { month: "2026-01", income: 280_000, expense: 450_000, balance: -170_000 },
        ],
      },
    },
    insights: null,
  },
};

export const NoTrend: Story = {
  name: "トレンドなし",
  args: {
    metrics: {
      ...baseMetrics,
      balance: {
        monthlyIncome: 500_000,
        monthlyExpense: 300_000,
        savingsRate: 40.0,
        trend: [],
      },
    },
    insights: null,
  },
};
