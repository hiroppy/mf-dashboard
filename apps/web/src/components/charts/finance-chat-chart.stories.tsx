import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { FinanceChatChart } from "./finance-chat-chart";

const meta = {
  component: FinanceChatChart,
  parameters: { layout: "centered" },
  decorators: [
    (Story: () => ReactNode) => <div className="w-[36rem] max-w-full p-4">{Story()}</div>,
  ],
} satisfies Meta<typeof FinanceChatChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MonthlyTrend: Story = {
  args: {
    chart: {
      title: "月別の収入と支出",
      chartType: "line",
      series: [
        { name: "収入", amountType: "income" },
        { name: "支出", amountType: "expense" },
      ],
      data: [
        { label: "4月", values: [420_000, 310_000] },
        { label: "5月", values: [430_000, 325_000] },
        { label: "6月", values: [425_000, 298_000] },
      ],
    },
  },
};

export const ExpenseBreakdown: Story = {
  args: {
    chart: {
      title: "支出の内訳",
      chartType: "pie",
      series: [{ name: "支出", amountType: "expense" }],
      data: [
        { label: "住居費", values: [120_000] },
        { label: "食費", values: [65_000] },
        { label: "交通費", values: [28_000] },
        { label: "その他", values: [42_000] },
      ],
    },
  },
};
