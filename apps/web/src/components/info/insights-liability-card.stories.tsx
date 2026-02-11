import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InsightsLiabilityCard } from "./insights-liability-card";

const meta = {
  title: "Info/InsightsLiabilityCard",
  component: InsightsLiabilityCard,
  tags: ["autodocs"],
} satisfies Meta<typeof InsightsLiabilityCard>;

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
  balance: { monthlyIncome: 0, monthlyExpense: 0, savingsRate: 0, trend: [] },
  liability: {
    totalLiabilities: 500_000,
    byCategory: [
      { category: "カード", amount: 300_000, pct: 60.0 },
      { category: "ローン", amount: 200_000, pct: 40.0 },
    ],
    debtToAssetRatio: 5.0,
  },
  healthScore: { totalScore: 0, categories: [] },
};

export const LowDebt: Story = {
  name: "負債少ない（比率5%）",
  args: {
    metrics: baseMetrics,
    insights: {
      summary: null,
      savings: null,
      investment: null,
      spending: null,
      balance: null,
      liability:
        "負債総額50万円、資産負債比率5.0%で健全な水準です。カード利用が60%を占めています。",
    },
  },
};

export const HighDebt: Story = {
  name: "負債多い（比率40%）",
  args: {
    metrics: {
      ...baseMetrics,
      liability: {
        totalLiabilities: 12_000_000,
        byCategory: [
          { category: "住宅ローン", amount: 10_000_000, pct: 83.3 },
          { category: "カード", amount: 1_500_000, pct: 12.5 },
          { category: "その他", amount: 500_000, pct: 4.2 },
        ],
        debtToAssetRatio: 40.0,
      },
    },
    insights: null,
  },
};

export const NoLiabilities: Story = {
  name: "負債なし",
  args: {
    metrics: {
      ...baseMetrics,
      liability: {
        totalLiabilities: 0,
        byCategory: [],
        debtToAssetRatio: 0,
      },
    },
    insights: null,
  },
};
