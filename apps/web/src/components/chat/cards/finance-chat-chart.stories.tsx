import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FinanceChatChart } from "./finance-chat-chart";

const meta = {
  title: "Chat/FinanceChatChart",
  component: FinanceChatChart,
  args: {
    card: {
      type: "chart",
      title: "月別の収支推移",
      chartType: "line",
      series: [
        { name: "収入", amountType: "income" },
        { name: "支出", amountType: "expense" },
      ],
      data: [
        { label: "5月", values: [280000, 210000] },
        { label: "6月", values: [300000, 220000] },
        { label: "7月", values: [320000, 200000] },
      ],
    },
  },
} satisfies Meta<typeof FinanceChatChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Line: Story = {};

export const Bar: Story = {
  args: { card: { ...meta.args.card, chartType: "bar" } },
};

export const SameTypeSeries: Story = {
  args: {
    card: {
      type: "chart",
      title: "年度別の支出比較",
      chartType: "line",
      series: [
        { name: "今年", amountType: "expense" },
        { name: "前年", amountType: "expense" },
      ],
      data: [
        { label: "5月", values: [210000, 190000] },
        { label: "6月", values: [220000, 230000] },
        { label: "7月", values: [200000, 215000] },
      ],
    },
  },
};

export const Pie: Story = {
  args: {
    card: {
      type: "chart",
      title: "支出内訳",
      chartType: "pie",
      series: [{ name: "支出", amountType: "expense" }],
      data: [
        { label: "食費", values: [120000] },
        { label: "日用品", values: [60000] },
        { label: "交通費", values: [30000] },
      ],
    },
  },
};

export const MixedBalanceLine: Story = {
  args: {
    card: {
      type: "chart",
      title: "月別の収支差額",
      chartType: "line",
      series: [{ name: "収支差額", amountType: "balance" }],
      data: [
        { label: "5月", values: [-100000] },
        { label: "6月", values: [0] },
        { label: "7月", values: [200000] },
      ],
    },
  },
};
