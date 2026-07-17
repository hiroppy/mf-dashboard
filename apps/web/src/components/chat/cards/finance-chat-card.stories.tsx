import type { FinanceChatCard as FinanceChatCardData } from "@mf-dashboard/analytics/chat/cards";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FinanceChatCard } from "./finance-chat-card";

const meta = {
  title: "Chat/FinanceChatCard",
  component: FinanceChatCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-lg p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FinanceChatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const summary = {
  type: "summary",
  title: "2026年7月の収支",
  description: "確定済みの取引を集計しています",
  href: "/cf/2026-07",
  metrics: [
    { label: "収入", amount: 350000, amountType: "income" },
    { label: "支出", amount: -218000, amountType: "expense" },
    { label: "収支", amount: 132000, amountType: "balance" },
  ],
} satisfies FinanceChatCardData;

export const Summary: Story = { args: { card: summary } };

export const TransactionList: Story = {
  args: {
    card: {
      type: "transactionList",
      title: "最近の支出",
      href: "/cf/2026-07",
      transactions: [
        {
          id: "transaction-a",
          date: "2026-07-17",
          description: "店舗 A",
          category: "食費",
          amount: -3200,
          amountType: "expense",
        },
        {
          id: "transaction-b",
          date: "2026-07-16",
          description: "交通機関 A",
          category: "交通費",
          amount: -860,
          amountType: "expense",
        },
      ],
    },
  },
};

export const CategoryBreakdown: Story = {
  args: {
    card: {
      type: "categoryBreakdown",
      title: "カテゴリ別支出",
      categories: [
        { name: "住居費", amount: -82000, amountType: "expense", percentage: 52.4 },
        { name: "食費", amount: -42000, amountType: "expense", percentage: 26.8 },
        { name: "交通費", amount: -14000, amountType: "expense", percentage: 8.9 },
      ],
    },
  },
};

export const Insight: Story = {
  args: {
    card: {
      type: "insight",
      title: "支出が減少しました",
      description: "前月と比べて食費が12,000円減っています。",
      amount: 12000,
      amountType: "balance",
      action: { label: "内訳を見る", href: "/cf/2026-07" },
    },
  },
};

export const Action: Story = {
  args: {
    card: {
      type: "action",
      title: "資産配分を確認しましょう",
      description: "現在の口座残高と資産カテゴリを確認できます。",
      action: { label: "資産を見る", href: "/bs" },
    },
  },
};

export const AllCards: Story = {
  args: { card: summary },
  render: () => (
    <div className="space-y-4">
      <FinanceChatCard card={summary} />
      <FinanceChatCard {...TransactionList.args} />
      <FinanceChatCard {...CategoryBreakdown.args} />
      <FinanceChatCard {...Insight.args} />
      <FinanceChatCard {...Action.args} />
    </div>
  ),
};
