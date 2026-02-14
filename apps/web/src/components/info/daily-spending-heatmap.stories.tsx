import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getTransactionsByMonth } from "@mf-dashboard/db";
import { mocked } from "storybook/test";
import { DailySpendingHeatmap } from "./daily-spending-heatmap";
import { DateFilterProvider } from "./date-filter-context";

const meta = {
  title: "Info/DailySpendingHeatmap",
  component: DailySpendingHeatmap,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <DateFilterProvider>
        <Story />
      </DateFilterProvider>
    ),
  ],
} satisfies Meta<typeof DailySpendingHeatmap>;

export default meta;
type Story = StoryObj<typeof meta>;

const tx = (id: number, date: string, amount: number, category = "食費") => ({
  id,
  mfId: `mf-${id}`,
  date,
  category,
  subCategory: null,
  description: `支出${id}`,
  amount,
  type: "expense" as const,
  isTransfer: false,
  isExcludedFromCalculation: false,
  accountId: 1,
  accountName: "サンプル銀行",
  transferTargetAccountId: null,
});

export const Default: Story = {
  args: {
    month: "2025-04",
  },
  beforeEach() {
    mocked(getTransactionsByMonth).mockResolvedValue([
      tx(1, "2025-04-03", 1200),
      tx(2, "2025-04-05", 3500),
      tx(3, "2025-04-05", 800),
      tx(4, "2025-04-08", 15000),
      tx(5, "2025-04-10", 2500),
      tx(6, "2025-04-12", 6000),
      tx(7, "2025-04-15", 12000),
      tx(8, "2025-04-15", 8000),
      tx(9, "2025-04-18", 4500),
      tx(10, "2025-04-20", 120000),
      tx(11, "2025-04-22", 2800),
      tx(12, "2025-04-24", 5200),
      tx(13, "2025-04-25", 3500),
      tx(14, "2025-04-28", 9000),
      tx(15, "2025-04-30", 1500),
    ]);
  },
};

export const SparseData: Story = {
  args: {
    month: "2025-05",
  },
  beforeEach() {
    mocked(getTransactionsByMonth).mockResolvedValue([
      tx(1, "2025-05-01", 50000),
      tx(2, "2025-05-14", 8000),
      tx(3, "2025-05-28", 3000),
    ]);
  },
};

export const NoExpenses: Story = {
  args: {
    month: "2025-06",
  },
  beforeEach() {
    mocked(getTransactionsByMonth).mockResolvedValue([]);
  },
};
