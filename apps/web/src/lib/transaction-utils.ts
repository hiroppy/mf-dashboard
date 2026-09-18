import type { Transaction, SortColumn } from "../components/info/transaction-table/types";

export function countBy<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export interface TransactionFilters {
  searchText: string;
  categories: string[];
  types: string[];
  accounts: string[];
  date: string | null;
}

export function filterTransactionsByYear(
  transactions: Transaction[],
  year: string | null,
): Transaction[] {
  if (!year) return transactions;
  return transactions.filter((transaction) => transaction.date.startsWith(`${year}-`));
}

export function filterTransactions(
  transactions: Transaction[],
  filters: TransactionFilters,
): Transaction[] {
  return transactions.filter((t) => {
    if (filters.searchText) {
      const search = filters.searchText.toLowerCase();
      const matchDesc = t.description?.toLowerCase().includes(search);
      const matchCat = (t.category ?? "振替").toLowerCase().includes(search);
      if (!matchDesc && !matchCat) return false;
    }

    const category = t.category ?? "振替";
    if (filters.categories.length > 0 && !filters.categories.includes(category)) {
      return false;
    }

    if (filters.types.length > 0 && !filters.types.includes(t.type)) {
      return false;
    }

    const account = t.accountName ?? "不明";
    if (filters.accounts.length > 0 && !filters.accounts.includes(account)) {
      return false;
    }

    if (filters.date && t.date !== filters.date) {
      return false;
    }

    return true;
  });
}

const SORT_FUNCTIONS: Record<SortColumn, (a: Transaction, b: Transaction) => number> = {
  date: (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  description: (a, b) => (a.description ?? "").localeCompare(b.description ?? ""),
  category: (a, b) => (a.category ?? "振替").localeCompare(b.category ?? "振替"),
  type: (a, b) => a.type.localeCompare(b.type),
  amount: (a, b) => {
    const signedA = a.type === "expense" ? -a.amount : a.amount;
    const signedB = b.type === "expense" ? -b.amount : b.amount;
    return signedA - signedB;
  },
  accountName: (a, b) => (a.accountName ?? "").localeCompare(b.accountName ?? ""),
};

export function sortTransactions(
  transactions: Transaction[],
  column: SortColumn,
  direction: "asc" | "desc",
): Transaction[] {
  const sorted = [...transactions].sort(SORT_FUNCTIONS[column]);
  return direction === "desc" ? sorted.reverse() : sorted;
}
