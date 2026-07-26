import { getTransactions } from "@mf-dashboard/db";
import { PieChart as PieChartIcon } from "lucide-react";
import { consolidateCategories } from "../../lib/aggregation";
import { EmptyState } from "../ui/empty-state";
import {
  type CategoryBreakdown,
  type CategoryTransaction,
  TransactionStatsClient,
} from "./transaction-stats.client";

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

  const createBreakdowns = (
    categories: Array<{ name: string; value: number }>,
    type: "income" | "expense",
  ): CategoryBreakdown[] => {
    const consolidated = consolidateCategories(categories);
    const visibleNames = new Set(
      consolidated
        .filter((category) => category.name !== "その他")
        .map((category) => category.name),
    );

    return consolidated.map((category) => {
      const memberNames =
        category.name === "その他"
          ? categories
              .filter((item) => item.name === "その他" || !visibleNames.has(item.name))
              .map((item) => item.name)
          : [category.name];
      const memberNameSet = new Set(memberNames);
      const matchingTransactions = validTransactions
        .filter((transaction) => {
          if (transaction.type !== type) return false;
          const transactionCategory =
            type === "income"
              ? (transaction.subCategory ?? "その他")
              : (transaction.category ?? "その他");
          return memberNameSet.has(transactionCategory);
        })
        .map(
          (transaction): CategoryTransaction => ({
            id: transaction.id,
            date: transaction.date,
            description: transaction.description,
            amount: transaction.amount,
            accountName: transaction.accountName,
            category:
              type === "income"
                ? (transaction.subCategory ?? "その他")
                : (transaction.category ?? "その他"),
          }),
        )
        .sort((a, b) => b.amount - a.amount);

      return {
        ...category,
        categories: memberNames,
        transactions: matchingTransactions,
      };
    });
  };

  return (
    <TransactionStatsClient
      year={year}
      income={createBreakdowns(incomeCategories, "income")}
      expense={createBreakdowns(expenseCategories, "expense")}
    />
  );
}
