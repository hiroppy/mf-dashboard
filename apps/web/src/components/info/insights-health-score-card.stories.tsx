import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InsightsHealthScoreCard } from "./insights-health-score-card";

const meta = {
  title: "Info/InsightsHealthScoreCard",
  component: InsightsHealthScoreCard,
  tags: ["autodocs"],
} satisfies Meta<typeof InsightsHealthScoreCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const createMetrics = (
  totalScore: number,
  categories: Array<{ name: string; score: number; maxScore: number }>,
) => ({
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
  liability: { totalLiabilities: 0, byCategory: [], debtToAssetRatio: 0 },
  healthScore: { totalScore, categories },
});

export const Excellent: Story = {
  name: "優秀 (80+)",
  args: {
    metrics: createMetrics(93, [
      { name: "貯蓄", score: 25, maxScore: 25 },
      { name: "投資", score: 20, maxScore: 25 },
      { name: "支出", score: 23, maxScore: 25 },
      { name: "収支", score: 25, maxScore: 25 },
    ]),
  },
};

export const Good: Story = {
  name: "良好 (60-79)",
  args: {
    metrics: createMetrics(68, [
      { name: "貯蓄", score: 18, maxScore: 25 },
      { name: "投資", score: 15, maxScore: 25 },
      { name: "支出", score: 20, maxScore: 25 },
      { name: "収支", score: 15, maxScore: 25 },
    ]),
  },
};

export const NeedsAttention: Story = {
  name: "要注意 (60未満)",
  args: {
    metrics: createMetrics(45, [
      { name: "貯蓄", score: 10, maxScore: 25 },
      { name: "投資", score: 8, maxScore: 25 },
      { name: "支出", score: 15, maxScore: 25 },
      { name: "収支", score: 12, maxScore: 25 },
    ]),
  },
};
