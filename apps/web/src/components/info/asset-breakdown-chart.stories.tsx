import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  getAssetBreakdownByCategory,
  getCategoryChangesForPeriod,
  getLatestTotalAssets,
  getLiabilityBreakdownByCategory,
} from "@mf-dashboard/db";
import { getLatestMonthlySummary } from "@mf-dashboard/db";
import { mocked } from "storybook/test";
import { AssetBreakdownChart } from "./asset-breakdown-chart";

const meta = {
  title: "Info/AssetBreakdownChart",
  component: AssetBreakdownChart,
  tags: ["autodocs"],
} satisfies Meta<typeof AssetBreakdownChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleChanges = {
  categories: [
    {
      name: "預金・現金・暗号資産",
      current: 5000000,
      previous: 4800000,
      change: 200000,
    },
    {
      name: "株式(現物)",
      current: 3000000,
      previous: 3100000,
      change: -100000,
    },
    { name: "投資信託", current: 2000000, previous: 1950000, change: 50000 },
    { name: "債券", current: 500000, previous: 500000, change: 0 },
    { name: "年金", current: 1500000, previous: 1480000, change: 20000 },
  ],
  total: { current: 12000000, previous: 11830000, change: 170000 },
};

export const Default: Story = {
  beforeEach() {
    mocked(getAssetBreakdownByCategory).mockResolvedValue([
      { category: "預金・現金・暗号資産", amount: 5000000 },
      { category: "株式(現物)", amount: 3000000 },
      { category: "投資信託", amount: 2000000 },
      { category: "債券", amount: 500000 },
      { category: "年金", amount: 1500000 },
    ]);
    mocked(getLatestTotalAssets).mockResolvedValue(12000000);
    mocked(getLiabilityBreakdownByCategory).mockResolvedValue([]);
    mocked(getCategoryChangesForPeriod).mockImplementation(async (period) => {
      if (period === "daily") return sampleChanges;
      if (period === "weekly")
        return {
          ...sampleChanges,
          total: { current: 12000000, previous: 11500000, change: 500000 },
        };
      return {
        ...sampleChanges,
        total: { current: 12000000, previous: 11000000, change: 1000000 },
      };
    });
    mocked(getLatestMonthlySummary).mockResolvedValue({
      month: "2026-01",
      totalIncome: 350000,
      totalExpense: 220000,
      netIncome: 130000,
    });
  },
};

export const SingleCategory: Story = {
  beforeEach() {
    mocked(getAssetBreakdownByCategory).mockResolvedValue([
      { category: "預金・現金・暗号資産", amount: 10000000 },
    ]);
    mocked(getLatestTotalAssets).mockResolvedValue(10000000);
    mocked(getLiabilityBreakdownByCategory).mockResolvedValue([]);
    mocked(getCategoryChangesForPeriod).mockImplementation(async (period) => {
      if (period === "daily")
        return {
          categories: [
            {
              name: "預金・現金・暗号資産",
              current: 10000000,
              previous: 9900000,
              change: 100000,
            },
          ],
          total: { current: 10000000, previous: 9900000, change: 100000 },
        };
      return null;
    });
    mocked(getLatestMonthlySummary).mockResolvedValue({
      month: "2026-01",
      totalIncome: 300000,
      totalExpense: 200000,
      netIncome: 100000,
    });
  },
};

export const ZeroAmount: Story = {
  beforeEach() {
    mocked(getAssetBreakdownByCategory).mockResolvedValue([
      { category: "預金・現金・暗号資産", amount: 0 },
      { category: "株式(現物)", amount: 0 },
    ]);
    mocked(getLatestTotalAssets).mockResolvedValue(0);
    mocked(getLiabilityBreakdownByCategory).mockResolvedValue([]);
    mocked(getCategoryChangesForPeriod).mockResolvedValue(null);
    mocked(getLatestMonthlySummary).mockResolvedValue(undefined);
  },
};

export const Empty: Story = {
  beforeEach() {
    mocked(getAssetBreakdownByCategory).mockResolvedValue([]);
    mocked(getLatestTotalAssets).mockResolvedValue(null);
    mocked(getLiabilityBreakdownByCategory).mockResolvedValue([]);
    mocked(getCategoryChangesForPeriod).mockResolvedValue(null);
    mocked(getLatestMonthlySummary).mockResolvedValue(undefined);
  },
};

export const NoPeriodComparison: Story = {
  beforeEach() {
    mocked(getAssetBreakdownByCategory).mockResolvedValue([
      { category: "預金・現金・暗号資産", amount: 5000000 },
      { category: "株式(現物)", amount: 3000000 },
    ]);
    mocked(getLatestTotalAssets).mockResolvedValue(8000000);
    mocked(getLiabilityBreakdownByCategory).mockResolvedValue([]);
    mocked(getCategoryChangesForPeriod).mockResolvedValue(null);
    mocked(getLatestMonthlySummary).mockResolvedValue({
      month: "2026-01",
      totalIncome: 250000,
      totalExpense: 180000,
      netIncome: 70000,
    });
  },
};
