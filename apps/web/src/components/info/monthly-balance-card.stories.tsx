import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getLatestMonthlySummary } from "@mf-dashboard/db";
import { getTransactionsByMonth } from "@mf-dashboard/db";
import { mocked } from "storybook/test";
import { MonthlyBalanceCard } from "./monthly-balance-card";

const meta = {
  title: "Info/MonthlyBalanceCard",
  component: MonthlyBalanceCard,
  tags: ["autodocs"],
} satisfies Meta<typeof MonthlyBalanceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  beforeEach() {
    mocked(getLatestMonthlySummary).mockResolvedValue({
      month: "2025-04",
      totalIncome: 350000,
      totalExpense: 220000,
      netIncome: 130000,
    });
    mocked(getTransactionsByMonth).mockResolvedValue([]);
  },
};

export const WithRecentTransactions: Story = {
  beforeEach() {
    mocked(getLatestMonthlySummary).mockResolvedValue({
      month: "2025-04",
      totalIncome: 350000,
      totalExpense: 220000,
      netIncome: 130000,
    });
    mocked(getTransactionsByMonth).mockResolvedValue([
      {
        id: 1,
        mfId: "mf-1",
        date: "2025-04-25",
        category: "食費",
        subCategory: null,
        description: "スーパーマーケット",
        amount: -3500,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "銀行口座",
        transferTargetAccountId: null,
      },
      {
        id: 2,
        mfId: "mf-2",
        date: "2025-04-24",
        category: "給与",
        subCategory: null,
        description: "4月分給与",
        amount: 350000,
        type: "income",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "銀行口座",
        transferTargetAccountId: null,
      },
      {
        id: 3,
        mfId: "mf-3",
        date: "2025-04-23",
        category: "交通費",
        subCategory: null,
        description: "電車定期券",
        amount: -12000,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "銀行口座",
        transferTargetAccountId: null,
      },
    ]);
  },
};

export const Deficit: Story = {
  beforeEach() {
    mocked(getLatestMonthlySummary).mockResolvedValue({
      month: "2025-04",
      totalIncome: 200000,
      totalExpense: 280000,
      netIncome: -80000,
    });
    mocked(getTransactionsByMonth).mockResolvedValue([
      {
        id: 1,
        mfId: "mf-1",
        date: "2025-04-27",
        category: "日用品",
        subCategory: null,
        description: "ドラッグストア",
        amount: -2800,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "銀行口座",
        transferTargetAccountId: null,
      },
      {
        id: 2,
        mfId: "mf-2",
        date: "2025-04-26",
        category: "外食",
        subCategory: null,
        description: "レストラン",
        amount: -5400,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "銀行口座",
        transferTargetAccountId: null,
      },
      {
        id: 3,
        mfId: "mf-3",
        date: "2025-04-25",
        category: "趣味・娯楽",
        subCategory: null,
        description: "書籍購入",
        amount: -1800,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "銀行口座",
        transferTargetAccountId: null,
      },
    ]);
  },
};

export const NoTransactions: Story = {
  beforeEach() {
    mocked(getLatestMonthlySummary).mockResolvedValue({
      month: "2025-04",
      totalIncome: 0,
      totalExpense: 0,
      netIncome: 0,
    });
    mocked(getTransactionsByMonth).mockResolvedValue([]);
  },
};

export const Empty: Story = {
  beforeEach() {
    mocked(getLatestMonthlySummary).mockResolvedValue(undefined);
    mocked(getTransactionsByMonth).mockResolvedValue([]);
  },
};
