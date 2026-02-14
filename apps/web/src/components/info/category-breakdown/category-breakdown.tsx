import { getMonthlyCategoryTotals } from "@mf-dashboard/db";
import { getTransactionsByMonth } from "@mf-dashboard/db";
import { List } from "lucide-react";
import { parseMonthString } from "../../../lib/calendar";
import { EmptyState } from "../../ui/empty-state";
import { CategoryBreakdownClient, type CategoryData } from "./category-breakdown.client";

interface CategoryBreakdownProps {
  month: string;
  type: "income" | "expense";
  groupId?: string;
}

const CONFIG = {
  income: { title: "収入内訳" },
  expense: { title: "支出内訳" },
} as const;

function getPreviousMonth(monthStr: string): string {
  const { year, month } = parseMonthString(monthStr);
  const d = new Date(year, month - 2, 1); // month-1 is current, month-2 is previous
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function CategoryBreakdown({ month, type, groupId }: CategoryBreakdownProps) {
  const categoryTotals = await getMonthlyCategoryTotals(month, groupId);
  const transactions = await getTransactionsByMonth(month, groupId);

  // Previous month data for delta display
  const prevMonth = getPreviousMonth(month);
  const prevCategoryTotals = await getMonthlyCategoryTotals(prevMonth, groupId);
  const prevAmountByCategory: Record<string, number> = {};
  for (const c of prevCategoryTotals) {
    if (c.type === type) {
      prevAmountByCategory[c.category] = c.totalAmount;
    }
  }

  // Filter transactions (exclude transfers and mf-grayout)
  const filteredTransactions = transactions.filter(
    (tx) => !tx.isTransfer && !tx.isExcludedFromCalculation,
  );

  // Build sub-category grouping: { "category:type" -> { subCategory -> transactions[] } }
  const subCategoryMap = filteredTransactions.reduce(
    (acc, tx) => {
      const key = `${tx.category}:${tx.type}`;
      if (!acc[key]) {
        acc[key] = {};
      }
      const sub = tx.subCategory || "未分類";
      if (!acc[key][sub]) {
        acc[key][sub] = [];
      }
      acc[key][sub].push({
        date: tx.date,
        description: tx.description ?? "",
        amount: tx.amount,
      });
      return acc;
    },
    {} as Record<
      string,
      Record<string, Array<{ date: string; description: string; amount: number }>>
    >,
  );

  function buildSubCategories(categoryKey: string) {
    const subs = subCategoryMap[categoryKey] || {};
    return Object.entries(subs)
      .map(([subCategory, txs]) => ({
        subCategory,
        amount: txs.reduce((sum, tx) => sum + tx.amount, 0),
        transactions: txs.sort((a, b) => b.amount - a.amount),
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  const data: CategoryData[] = categoryTotals
    .filter((c) => c.type === type)
    .map((c) => ({
      category: c.category,
      amount: c.totalAmount,
      subCategories: buildSubCategories(`${c.category}:${type}`),
    }))
    .sort((a, b) => b.amount - a.amount);

  if (data.length === 0) {
    return <EmptyState icon={List} title={CONFIG[type].title} />;
  }

  return (
    <CategoryBreakdownClient
      title={CONFIG[type].title}
      data={data}
      type={type}
      prevAmountByCategory={prevAmountByCategory}
    />
  );
}
