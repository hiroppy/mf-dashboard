import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getTransactions, getTransactionsByMonth } from "@mf-dashboard/db";
import { mocked } from "storybook/test";
import { DateFilterProvider } from "../date-filter-context";
import { TransactionTable } from "./transaction-table";

const meta = {
  title: "Info/TransactionTable",
  component: TransactionTable,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <DateFilterProvider>
        <Story />
      </DateFilterProvider>
    ),
  ],
} satisfies Meta<typeof TransactionTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const tx = (
  id: number,
  date: string,
  category: string | null,
  description: string,
  amount: number,
  type: string,
  accountName: string,
  isTransfer = false,
) => ({
  id,
  mfId: `mf-${id}`,
  date,
  category,
  subCategory: null,
  description,
  amount,
  type,
  isTransfer,
  isExcludedFromCalculation: false,
  accountId: 1,
  accountName,
  transferTargetAccountId: null,
});

// ソート検証用: 同じカテゴリ・同じ description が異なる日付・金額・口座に散在
const aprilTransactions = [
  tx(1, "2025-04-25", "食費", "スーパー", 3500, "expense", "サンプル銀行A"),
  tx(2, "2025-04-10", "食費", "スーパー", 5200, "expense", "サンプル銀行B"),
  tx(3, "2025-04-18", "食費", "コンビニ", 800, "expense", "サンプルカード"),
  tx(4, "2025-04-25", "収入", "4月分給与", 350000, "income", "サンプル銀行A"),
  tx(5, "2025-04-15", "収入", "副業収入", 50000, "income", "サンプル銀行B"),
  tx(6, "2025-04-24", "交通費", "電車定期券", 12000, "expense", "サンプル銀行A"),
  tx(7, "2025-04-05", "交通費", "タクシー", 3800, "expense", "サンプルカード"),
  tx(8, "2025-04-23", null, "口座間振替", 50000, "transfer", "サンプル銀行A", true),
  tx(9, "2025-04-22", "日用品", "ドラッグストア", 2800, "expense", "サンプル銀行B"),
  tx(10, "2025-04-03", "日用品", "ドラッグストア", 1500, "expense", "サンプル銀行A"),
  tx(11, "2025-04-21", "趣味・娯楽", "書籍購入", 1800, "expense", "サンプル銀行B"),
  tx(12, "2025-04-08", "趣味・娯楽", "映画", 2000, "expense", "サンプルカード"),
  tx(13, "2025-04-20", "住宅", "家賃4月分", 120000, "expense", "サンプル銀行A"),
  tx(14, "2025-04-17", "水道・光熱費", "電気料金", 12000, "expense", "サンプル銀行A"),
  tx(15, "2025-04-16", "水道・光熱費", "ガス料金", 8000, "expense", "サンプル銀行A"),
  tx(16, "2025-04-12", "通信費", "携帯料金", 15000, "expense", "サンプルカード"),
];

const otherMonthTransactions = [
  tx(17, "2025-03-25", "収入", "3月分給与", 340000, "income", "サンプル銀行A"),
  tx(18, "2025-03-20", "住宅", "家賃3月分", 120000, "expense", "サンプル銀行A"),
  tx(19, "2025-03-15", "食費", "スーパー", 4200, "expense", "サンプル銀行B"),
  tx(20, "2025-05-05", "食費", "コンビニ", 600, "expense", "サンプルカード"),
  tx(21, "2025-05-10", "通信費", "携帯料金", 15000, "expense", "サンプルカード"),
];

const allTransactions = [...aprilTransactions, ...otherMonthTransactions];

export const Default: Story = {
  beforeEach() {
    mocked(getTransactions).mockResolvedValue(allTransactions);
  },
};

export const ByMonth: Story = {
  args: {
    month: "2025-04",
  },
  beforeEach() {
    mocked(getTransactionsByMonth).mockResolvedValue(aprilTransactions);
  },
};

export const Empty: Story = {
  beforeEach() {
    mocked(getTransactions).mockResolvedValue([]);
  },
};
