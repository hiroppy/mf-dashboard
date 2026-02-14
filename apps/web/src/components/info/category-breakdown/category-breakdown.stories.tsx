import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getMonthlyCategoryTotals } from "@mf-dashboard/db";
import { getTransactionsByMonth } from "@mf-dashboard/db";
import { mocked } from "storybook/test";
import { CategoryBreakdown } from "./category-breakdown";

const meta = {
  title: "Info/CategoryBreakdown",
  component: CategoryBreakdown,
  tags: ["autodocs"],
} satisfies Meta<typeof CategoryBreakdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expense: Story = {
  args: {
    month: "2025-04",
    type: "expense",
  },
  beforeEach() {
    mocked(getMonthlyCategoryTotals).mockImplementation(async (month: string) => {
      // 先月データなし（空配列を返す）
      if (month !== "2025-04") return [];
      return [
        {
          month: "2025-04",
          category: "食費",
          type: "expense",
          totalAmount: 80000,
        },
        {
          month: "2025-04",
          category: "住宅",
          type: "expense",
          totalAmount: 120000,
        },
        {
          month: "2025-04",
          category: "水道・光熱費",
          type: "expense",
          totalAmount: 20000,
        },
        {
          month: "2025-04",
          category: "通信費",
          type: "expense",
          totalAmount: 15000,
        },
        {
          month: "2025-04",
          category: "交通費",
          type: "expense",
          totalAmount: 10000,
        },
        {
          month: "2025-04",
          category: "日用品",
          type: "expense",
          totalAmount: 8000,
        },
        {
          month: "2025-04",
          category: "趣味・娯楽",
          type: "expense",
          totalAmount: 25000,
        },
      ];
    });
    mocked(getTransactionsByMonth).mockResolvedValue([
      {
        id: 1,
        mfId: "mf-1",
        date: "2025-04-25",
        category: "食費",
        subCategory: "外食",
        description: "レストラン",
        amount: -3500,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "サンプル銀行",
        transferTargetAccountId: null,
      },
      {
        id: 2,
        mfId: "mf-2",
        date: "2025-04-24",
        category: "食費",
        subCategory: "食料品",
        description: "スーパー",
        amount: -5000,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "サンプル銀行",
        transferTargetAccountId: null,
      },
      {
        id: 3,
        mfId: "mf-3",
        date: "2025-04-20",
        category: "住宅",
        subCategory: "家賃",
        description: "家賃4月分",
        amount: -120000,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "サンプル銀行",
        transferTargetAccountId: null,
      },
      {
        id: 4,
        mfId: "mf-4",
        date: "2025-04-15",
        category: "水道・光熱費",
        subCategory: "電気代",
        description: "電気料金",
        amount: -12000,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "サンプル銀行",
        transferTargetAccountId: null,
      },
      {
        id: 5,
        mfId: "mf-5",
        date: "2025-04-15",
        category: "水道・光熱費",
        subCategory: "ガス代",
        description: "ガス料金",
        amount: -8000,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "サンプル銀行",
        transferTargetAccountId: null,
      },
      {
        id: 6,
        mfId: "mf-6",
        date: "2025-04-10",
        category: "通信費",
        subCategory: "携帯電話",
        description: "携帯料金",
        amount: -15000,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "サンプル銀行",
        transferTargetAccountId: null,
      },
      {
        id: 7,
        mfId: "mf-7",
        date: "2025-04-18",
        category: "交通費",
        subCategory: "電車",
        description: "定期券",
        amount: -10000,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "サンプル銀行",
        transferTargetAccountId: null,
      },
      {
        id: 8,
        mfId: "mf-8",
        date: "2025-04-22",
        category: "日用品",
        subCategory: "消耗品",
        description: "ドラッグストア",
        amount: -8000,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "サンプル銀行",
        transferTargetAccountId: null,
      },
      {
        id: 9,
        mfId: "mf-9",
        date: "2025-04-12",
        category: "趣味・娯楽",
        subCategory: "書籍",
        description: "書籍購入",
        amount: -15000,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "サンプル銀行",
        transferTargetAccountId: null,
      },
      {
        id: 10,
        mfId: "mf-10",
        date: "2025-04-08",
        category: "趣味・娯楽",
        subCategory: "ゲーム",
        description: "ゲームソフト",
        amount: -10000,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "サンプル銀行",
        transferTargetAccountId: null,
      },
    ]);
  },
};

export const Income: Story = {
  args: {
    month: "2025-04",
    type: "income",
  },
  beforeEach() {
    mocked(getMonthlyCategoryTotals).mockImplementation(async (month: string) => {
      // 先月データなし（空配列を返す）
      if (month !== "2025-04") return [];
      return [
        {
          month: "2025-04",
          category: "収入",
          type: "income",
          totalAmount: 420000,
        },
      ];
    });
    mocked(getTransactionsByMonth).mockResolvedValue([
      {
        id: 1,
        mfId: "mf-1",
        date: "2025-04-25",
        category: "収入",
        subCategory: "給与",
        description: "4月分給与",
        amount: 350000,
        type: "income",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "サンプル銀行",
        transferTargetAccountId: null,
      },
      {
        id: 2,
        mfId: "mf-2",
        date: "2025-04-20",
        category: "収入",
        subCategory: "副業",
        description: "副業収入",
        amount: 50000,
        type: "income",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "サンプル銀行",
        transferTargetAccountId: null,
      },
      {
        id: 3,
        mfId: "mf-3",
        date: "2025-04-10",
        category: "収入",
        subCategory: "配当",
        description: "配当金",
        amount: 20000,
        type: "income",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 2,
        accountName: "サンプル証券",
        transferTargetAccountId: null,
      },
    ]);
  },
};

export const WithDelta: Story = {
  args: {
    month: "2025-05",
    type: "expense",
  },
  beforeEach() {
    mocked(getMonthlyCategoryTotals).mockImplementation(async (month: string) => {
      if (month === "2025-05") {
        return [
          {
            month: "2025-05",
            category: "食費",
            type: "expense",
            totalAmount: 185000,
          },
          {
            month: "2025-05",
            category: "住宅",
            type: "expense",
            totalAmount: 120000,
          },
          {
            month: "2025-05",
            category: "交通費",
            type: "expense",
            totalAmount: 5000,
          },
          {
            month: "2025-05",
            category: "趣味・娯楽",
            type: "expense",
            totalAmount: 130000,
          },
        ];
      }
      // 前月 (2025-04)
      return [
        {
          month: "2025-04",
          category: "食費",
          type: "expense",
          totalAmount: 80000,
        },
        {
          month: "2025-04",
          category: "住宅",
          type: "expense",
          totalAmount: 120000,
        },
        {
          month: "2025-04",
          category: "交通費",
          type: "expense",
          totalAmount: 10000,
        },
        {
          month: "2025-04",
          category: "趣味・娯楽",
          type: "expense",
          totalAmount: 25000,
        },
      ];
    });
    mocked(getTransactionsByMonth).mockResolvedValue([
      {
        id: 1,
        mfId: "mf-1",
        date: "2025-05-10",
        category: "食費",
        subCategory: "外食",
        description: "レストラン",
        amount: -5000,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
        accountId: 1,
        accountName: "サンプル銀行",
        transferTargetAccountId: null,
      },
    ]);
  },
};

export const Empty: Story = {
  args: {
    month: "2025-04",
    type: "expense",
  },
  beforeEach() {
    mocked(getMonthlyCategoryTotals).mockResolvedValue([]);
    mocked(getTransactionsByMonth).mockResolvedValue([]);
  },
};
