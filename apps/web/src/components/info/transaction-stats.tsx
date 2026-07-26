import { getTransactions } from "@mf-dashboard/db";
import { PieChart as PieChartIcon } from "lucide-react";
import { EmptyState } from "../ui/empty-state";
import { createBreakdowns } from "./transaction-stats-utils";
import { TransactionStatsClient } from "./transaction-stats.client";

interface TransactionStatsProps {
  year: string;
  groupId?: string;
}

export async function TransactionStats({ year, groupId }: TransactionStatsProps) {
  const allTransactions = await getTransactions({ groupId });
  const transactions = allTransactions.filter((t) => t.date.substring(0, 4) === year);

  // Filter out excluded transactions and transfers (for expense)
  const validTransactions = transactions.filter(
    (t) => !t.isExcludedFromCalculation && !t.isTransfer,
  );

  if (validTransactions.length === 0) {
    return <EmptyState icon={PieChartIcon} title="カテゴリ別内訳" />;
  }

  // Category breakdown for expenses (by large category) and income (by sub-category)
  const expenseCategoryMap = new Map<string, number>();
  const incomeSubCategoryMap = new Map<string, number>();

  for (const t of validTransactions) {
    if (t.type === "expense") {
      const category = t.category ?? "その他";
      expenseCategoryMap.set(category, (expenseCategoryMap.get(category) ?? 0) + t.amount);
    } else if (t.type === "income") {
      // Use sub-category for income (since large category is mostly just "収入")
      const subCategory = t.subCategory ?? "その他";
      incomeSubCategoryMap.set(
        subCategory,
        (incomeSubCategoryMap.get(subCategory) ?? 0) + t.amount,
      );
    }
  }

  const expenseCategories = Array.from(expenseCategoryMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const incomeCategories = Array.from(incomeSubCategoryMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <TransactionStatsClient
      year={year}
      income={createBreakdowns(incomeCategories, "income", validTransactions)}
      expense={createBreakdowns(expenseCategories, "expense", validTransactions)}
    />
  );
}
