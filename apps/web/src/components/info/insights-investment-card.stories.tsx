import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InsightsInvestmentCard } from "./insights-investment-card";

const meta = {
  title: "Info/InsightsInvestmentCard",
  component: InsightsInvestmentCard,
  tags: ["autodocs"],
} satisfies Meta<typeof InsightsInvestmentCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseMetrics = {
  savings: { totalAssets: 0, liquidAssets: 0, monthlyExpenseAvg: 0, emergencyFundMonths: 0 },
  investment: {
    holdings: [
      {
        name: "eMAXIS Slim 全世界株式",
        amount: 5_000_000,
        unrealizedGain: 1_200_000,
        unrealizedGainPct: 31.5,
      },
      {
        name: "eMAXIS Slim 米国株式",
        amount: 3_000_000,
        unrealizedGain: 800_000,
        unrealizedGainPct: 36.4,
      },
    ],
    totalInvestment: 8_000_000,
    totalUnrealizedGain: 2_000_000,
    totalUnrealizedGainPct: 33.3,
    diversificationScore: 65,
  },
  spending: { monthlyAverage: 0, byCategory: {}, topCategories: [], anomalies: [] },
  growth: { monthlyGrowthRate: 0, projectedAnnualRate: 0, projections: [] },
  balance: { monthlyIncome: 0, monthlyExpense: 0, savingsRate: 0, trend: [] },
  liability: { totalLiabilities: 0, byCategory: [], debtToAssetRatio: 0 },
  healthScore: { totalScore: 0, categories: [] },
};

export const Profit: Story = {
  name: "含み益",
  args: {
    metrics: baseMetrics,
    insights: {
      summary: null,
      savings: null,
      investment: "保有2銘柄の含み益は合計200万円（+33.3%）。分散度65/100は改善の余地あり。",
      spending: null,
      balance: null,
      liability: null,
    },
  },
};

export const Loss: Story = {
  name: "含み損",
  args: {
    metrics: {
      ...baseMetrics,
      investment: {
        ...baseMetrics.investment,
        totalUnrealizedGain: -500_000,
        totalUnrealizedGainPct: -5.9,
      },
    },
    insights: null,
  },
};

export const LowDiversification: Story = {
  name: "分散度低い",
  args: {
    metrics: {
      ...baseMetrics,
      investment: {
        ...baseMetrics.investment,
        diversificationScore: 20,
      },
    },
    insights: null,
  },
};
