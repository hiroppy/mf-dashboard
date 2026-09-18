import {
  getAssetBreakdownByCategory,
  getLatestTotalAssets,
  getLiabilityBreakdownByCategory,
} from "@mf-dashboard/db";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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
      { category: "預金・現金", amount: 5000000 },
      { category: "株式(現物)", amount: 3000000 },
      { category: "投資信託", amount: 2000000 },
      { category: "年金", amount: 1500000 },
    ]);
    mocked(getLiabilityBreakdownByCategory).mockResolvedValue([
      { category: "住宅ローン", amount: 3000000 },
      { category: "カードローン", amount: 500000 },
    ]);
    mocked(getLatestTotalAssets).mockResolvedValue(12000000);
  },
};

export const Empty: Story = {
  beforeEach() {
    mocked(getAssetBreakdownByCategory).mockResolvedValue([]);
    mocked(getLiabilityBreakdownByCategory).mockResolvedValue([]);
    mocked(getLatestTotalAssets).mockResolvedValue(null);
  },
};

export const NoLiabilities: Story = {
  beforeEach() {
    mocked(getAssetBreakdownByCategory).mockResolvedValue([
      { category: "預金・現金", amount: 8000000 },
      { category: "株式(現物)", amount: 2000000 },
    ]);
    mocked(getLiabilityBreakdownByCategory).mockResolvedValue([]);
    mocked(getLatestTotalAssets).mockResolvedValue(10000000);
  },
};
