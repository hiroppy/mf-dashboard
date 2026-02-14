import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getExpenseByFixedVariable } from "@mf-dashboard/db";
import { mocked } from "storybook/test";
import { FixedVariableBreakdown } from "./fixed-variable-breakdown";

const meta = {
  title: "Info/FixedVariableBreakdown",
  component: FixedVariableBreakdown,
  tags: ["autodocs"],
} satisfies Meta<typeof FixedVariableBreakdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    month: "2026-01",
  },
  beforeEach() {
    mocked(getExpenseByFixedVariable).mockResolvedValue({
      fixed: {
        total: 180000,
        categories: [
          { category: "住居費", amount: 120000 },
          { category: "通信費", amount: 15000 },
          { category: "保険", amount: 25000 },
          { category: "サブスクリプション", amount: 20000 },
        ],
      },
      variable: {
        total: 120000,
        categories: [
          { category: "食費", amount: 60000 },
          { category: "日用品", amount: 15000 },
          { category: "交通費", amount: 10000 },
          { category: "趣味・娯楽", amount: 20000 },
          { category: "外食", amount: 15000 },
        ],
      },
    });
  },
};

export const FixedHeavy: Story = {
  args: {
    month: "2026-01",
  },
  beforeEach() {
    mocked(getExpenseByFixedVariable).mockResolvedValue({
      fixed: {
        total: 250000,
        categories: [
          { category: "住居費", amount: 150000 },
          { category: "保険", amount: 50000 },
          { category: "通信費", amount: 30000 },
          { category: "サブスクリプション", amount: 20000 },
        ],
      },
      variable: {
        total: 50000,
        categories: [
          { category: "食費", amount: 30000 },
          { category: "日用品", amount: 20000 },
        ],
      },
    });
  },
};

export const Empty: Story = {
  args: {
    month: "2026-01",
  },
  beforeEach() {
    mocked(getExpenseByFixedVariable).mockResolvedValue({
      fixed: { total: 0, categories: [] },
      variable: { total: 0, categories: [] },
    });
  },
};
