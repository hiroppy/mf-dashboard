import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getTransactions } from "@mf-dashboard/db";
import { mocked } from "storybook/test";
import { TransactionStats } from "./transaction-stats";

const meta = {
  title: "Info/TransactionStats",
  component: TransactionStats,
  tags: ["autodocs"],
} satisfies Meta<typeof TransactionStats>;

export default meta;
type Story = StoryObj<typeof meta>;

const makeTransaction = (
  id: number,
  overrides: Partial<{
    date: string;
    category: string;
    description: string;
    amount: number;
    type: string;
    isTransfer: boolean;
    transferTargetAccountId: number | null;
  }>,
) => ({
  id,
  mfId: `mf-${id}`,
  date: overrides.date ?? "2025-04-15",
  category: overrides.category ?? "食費",
  subCategory: null,
  description: overrides.description ?? "取引",
  amount: overrides.amount ?? -3000,
  type: overrides.type ?? "expense",
  isTransfer: overrides.isTransfer ?? false,
  isExcludedFromCalculation: false,
  accountId: 1,
  accountName: "サンプル銀行",
  transferTargetAccountId: overrides.transferTargetAccountId ?? null,
});

export const Default: Story = {
  args: {
    year: "2025",
  },
  beforeEach() {
    mocked(getTransactions).mockResolvedValue([
      makeTransaction(1, { category: "食費", amount: 50000 }),
      makeTransaction(2, { category: "住宅", amount: 120000 }),
      makeTransaction(3, { category: "水道・光熱費", amount: 20000 }),
      makeTransaction(4, { category: "通信費", amount: 15000 }),
      makeTransaction(5, { category: "交通費", amount: 10000 }),
      makeTransaction(6, { category: "趣味・娯楽", amount: 30000 }),
      makeTransaction(7, { category: "日用品", amount: 8000 }),
      makeTransaction(8, { category: "収入", amount: 350000, type: "income" }),
      makeTransaction(9, { category: "収入", amount: 50000, type: "income" }),
      makeTransaction(10, { category: "収入", amount: 20000, type: "income" }),
    ]);
  },
};

export const Empty: Story = {
  args: {
    year: "2025",
  },
  beforeEach() {
    mocked(getTransactions).mockResolvedValue([]);
  },
};
