import { consolidateCategories } from "../../lib/aggregation";
import type { CategoryBreakdown, CategoryTransaction } from "./transaction-stats.client";

interface BreakdownTransaction {
  id: number;
  date: string;
  description: string | null;
  amount: number;
  accountName: string | null;
  category: string | null;
  subCategory: string | null;
  type: string;
}

interface NamedValue {
  name: string;
  value: number;
}

export type TransactionSort = "amount" | "date";

export function sortCategoryTransactions(
  transactions: readonly CategoryTransaction[],
  sortBy: TransactionSort,
): CategoryTransaction[] {
  return [...transactions].sort((a, b) =>
    sortBy === "amount" ? b.amount - a.amount : b.date.localeCompare(a.date),
  );
}

export function createBreakdowns(
  categories: NamedValue[],
  type: "income" | "expense",
  transactions: BreakdownTransaction[],
): CategoryBreakdown[] {
  const consolidated = consolidateCategories(categories);
  const visibleNames = new Set(
    consolidated.filter((category) => category.name !== "その他").map((category) => category.name),
  );

  return consolidated.map((category) => {
    const memberNames =
      category.name === "その他"
        ? categories
            .filter((item) => item.name === "その他" || !visibleNames.has(item.name))
            .map((item) => item.name)
        : [category.name];
    const memberNameSet = new Set(memberNames);
    const matchingTransactions = transactions
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
}

export function calculateCompositionPercentage(value: number, total: number): number {
  return total === 0 ? 0 : (value / total) * 100;
}
