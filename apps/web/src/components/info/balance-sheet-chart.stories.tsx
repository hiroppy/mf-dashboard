import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getAssetBreakdownByCategory, getLiabilityBreakdownByCategory } from "@mf-dashboard/db";
import { getLatestMonthlySummary } from "@mf-dashboard/db";
import { mocked } from "storybook/test";
import { BalanceSheetChart } from "./balance-sheet-chart";

const meta = {
  title: "Info/BalanceSheetChart",
  component: BalanceSheetChart,
  tags: ["autodocs"],
} satisfies Meta<typeof BalanceSheetChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  beforeEach() {
    mocked(getAssetBreakdownByCategory).mockResolvedValue([
      { category: "預金・現金・暗号資産", amount: 5000000 },
      { category: "株式(現物)", amount: 3000000 },
      { category: "投資信託", amount: 2000000 },
      { category: "年金", amount: 1500000 },
    ]);
    mocked(getLiabilityBreakdownByCategory).mockResolvedValue([
      { category: "住宅ローン", amount: 3000000 },
      { category: "カードローン", amount: 500000 },
    ]);
    mocked(getLatestMonthlySummary).mockResolvedValue({
      month: "2025-01",
      totalIncome: 500000,
      totalExpense: 300000,
      netIncome: 200000,
    });
  },
};

export const Empty: Story = {
  beforeEach() {
    mocked(getAssetBreakdownByCategory).mockResolvedValue([]);
    mocked(getLiabilityBreakdownByCategory).mockResolvedValue([]);
    mocked(getLatestMonthlySummary).mockResolvedValue(undefined);
  },
};

export const NoLiabilities: Story = {
  beforeEach() {
    mocked(getAssetBreakdownByCategory).mockResolvedValue([
      { category: "預金・現金・暗号資産", amount: 8000000 },
      { category: "株式(現物)", amount: 2000000 },
    ]);
    mocked(getLiabilityBreakdownByCategory).mockResolvedValue([]);
    mocked(getLatestMonthlySummary).mockResolvedValue({
      month: "2025-01",
      totalIncome: 500000,
      totalExpense: 300000,
      netIncome: 200000,
    });
  },
};
