import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getMonthlyCategoryTotals } from "@mf-dashboard/db";
import { getTransactionsByMonth } from "@mf-dashboard/db";
import { mocked } from "storybook/test";
import { SankeyDiagram } from "./sankey-diagram";

const meta = {
  title: "Info/SankeyDiagram",
  component: SankeyDiagram,
  tags: ["autodocs"],
} satisfies Meta<typeof SankeyDiagram>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    month: "2025-01",
  },
  beforeEach: () => {
    mocked(getMonthlyCategoryTotals).mockResolvedValue([
      {
        month: "2025-01",
        category: "給与",
        type: "income",
        totalAmount: 400000,
      },
      {
        month: "2025-01",
        category: "副業",
        type: "income",
        totalAmount: 50000,
      },
      {
        month: "2025-01",
        category: "配当",
        type: "income",
        totalAmount: 20000,
      },
      {
        month: "2025-01",
        category: "食費",
        type: "expense",
        totalAmount: 80000,
      },
      {
        month: "2025-01",
        category: "住居費",
        type: "expense",
        totalAmount: 120000,
      },
      {
        month: "2025-01",
        category: "光熱費",
        type: "expense",
        totalAmount: 20000,
      },
      {
        month: "2025-01",
        category: "通信費",
        type: "expense",
        totalAmount: 15000,
      },
      {
        month: "2025-01",
        category: "交通費",
        type: "expense",
        totalAmount: 10000,
      },
      {
        month: "2025-01",
        category: "趣味・娯楽",
        type: "expense",
        totalAmount: 30000,
      },
      {
        month: "2025-01",
        category: "日用品",
        type: "expense",
        totalAmount: 15000,
      },
    ]);
    mocked(getTransactionsByMonth).mockResolvedValue([]);
  },
};

export const Deficit: Story = {
  args: {
    month: "2025-02",
  },
  beforeEach: () => {
    mocked(getMonthlyCategoryTotals).mockResolvedValue([
      {
        month: "2025-02",
        category: "給与",
        type: "income",
        totalAmount: 300000,
      },
      {
        month: "2025-02",
        category: "食費",
        type: "expense",
        totalAmount: 100000,
      },
      {
        month: "2025-02",
        category: "住居費",
        type: "expense",
        totalAmount: 150000,
      },
      {
        month: "2025-02",
        category: "光熱費",
        type: "expense",
        totalAmount: 30000,
      },
      {
        month: "2025-02",
        category: "交通費",
        type: "expense",
        totalAmount: 50000,
      },
      {
        month: "2025-02",
        category: "趣味・娯楽",
        type: "expense",
        totalAmount: 40000,
      },
    ]);
    mocked(getTransactionsByMonth).mockResolvedValue([]);
  },
};

export const Empty: Story = {
  args: {
    month: "2025-03",
  },
  beforeEach: () => {
    mocked(getMonthlyCategoryTotals).mockResolvedValue([]);
    mocked(getTransactionsByMonth).mockResolvedValue([]);
  },
};
