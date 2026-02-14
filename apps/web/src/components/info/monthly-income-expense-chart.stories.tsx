import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getMonthlySummaries } from "@mf-dashboard/db";
import { mocked } from "storybook/test";
import { MonthlyIncomeExpenseChart } from "./monthly-income-expense-chart";

const generateMockData = () => {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const totalIncome = 300000 + Math.round(Math.random() * 200000);
    const totalExpense = 200000 + Math.round(Math.random() * 150000);
    return {
      month,
      totalIncome,
      totalExpense,
      netIncome: totalIncome - totalExpense,
    };
  });
};

const meta = {
  title: "Info/MonthlyIncomeExpenseChart",
  component: MonthlyIncomeExpenseChart,
  tags: ["autodocs"],
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/",
      },
    },
  },
} satisfies Meta<typeof MonthlyIncomeExpenseChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  beforeEach() {
    mocked(getMonthlySummaries).mockResolvedValue(generateMockData());
  },
};

export const HighExpense: Story = {
  beforeEach() {
    mocked(getMonthlySummaries).mockResolvedValue([
      { month: "2025-07", totalIncome: 300000, totalExpense: 500000, netIncome: -200000 },
      { month: "2025-08", totalIncome: 320000, totalExpense: 480000, netIncome: -160000 },
      { month: "2025-09", totalIncome: 310000, totalExpense: 520000, netIncome: -210000 },
      { month: "2025-10", totalIncome: 350000, totalExpense: 450000, netIncome: -100000 },
      { month: "2025-11", totalIncome: 300000, totalExpense: 400000, netIncome: -100000 },
      { month: "2025-12", totalIncome: 330000, totalExpense: 470000, netIncome: -140000 },
    ]);
  },
};

export const Empty: Story = {
  beforeEach() {
    mocked(getMonthlySummaries).mockResolvedValue([]);
  },
};
