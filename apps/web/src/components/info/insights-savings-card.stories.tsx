import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InsightsSavingsCard } from "./insights-savings-card";

const meta = {
  title: "Info/InsightsSavingsCard",
  component: InsightsSavingsCard,
  tags: ["autodocs"],
} satisfies Meta<typeof InsightsSavingsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseMetrics = {
  savings: {
    totalAssets: 99_800_000,
    liquidAssets: 45_000_000,
    monthlyExpenseAvg: 420_000,
    emergencyFundMonths: 10.7,
  },
  investment: {
    holdings: [],
    totalInvestment: 50_000_000,
    totalUnrealizedGain: 5_000_000,
    totalUnrealizedGainPct: 11.1,
    diversificationScore: 65,
  },
  spending: {
    monthlyAverage: 420_000,
    byCategory: {},
    topCategories: [],
    anomalies: [],
  },
  growth: {
    monthlyGrowthRate: 0.029,
    projectedAnnualRate: 0.403,
    projections: [],
  },
  balance: {
    monthlyIncome: 800_000,
    monthlyExpense: 420_000,
    savingsRate: 47.5,
    trend: [],
  },
  liability: {
    totalLiabilities: 0,
    byCategory: [],
    debtToAssetRatio: 0,
  },
  healthScore: {
    totalScore: 93,
    categories: [],
  },
};

export const Default: Story = {
  args: {
    metrics: baseMetrics,
    insights: {
      summary: null,
      savings:
        "緊急予備資金は10.7ヶ月分で十分な水準を維持しています。流動性比率は45.1%と安定。月次成長率は+2.9%で資産は増加トレンドにあります。",
      investment: null,
      spending: null,
      balance: null,
      liability: null,
    },
  },
};

export const NegativeGrowth: Story = {
  name: "成長率マイナス",
  args: {
    metrics: {
      ...baseMetrics,
      growth: { monthlyGrowthRate: -0.015, projectedAnnualRate: -0.165, projections: [] },
    },
    insights: null,
  },
};

export const LowEmergencyFund: Story = {
  name: "緊急予備資金不足",
  args: {
    metrics: {
      ...baseMetrics,
      savings: {
        ...baseMetrics.savings,
        liquidAssets: 1_000_000,
        emergencyFundMonths: 2.4,
      },
    },
    insights: null,
  },
};

export const NoInsights: Story = {
  name: "インサイトなし",
  args: {
    metrics: baseMetrics,
    insights: null,
  },
};
