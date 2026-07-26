import { useMemo, useState } from "react";
import {
  countBy,
  filterTransactions,
  filterTransactionsByYear,
  sortTransactions,
} from "../../../lib/transaction-utils";
import type { SortColumn, Transaction, TransactionKpi } from "./types";

interface UseTransactionFilteringOptions {
  transactions: Transaction[];
  selectedDate: string | null;
  pageSize: number;
  yearFilterEnabled?: boolean;
}

const TYPE_OPTIONS = ["income", "expense", "transfer"];

function getAvailableYears(transactions: Transaction[]): string[] {
  return Array.from(
    new Set(transactions.map((transaction) => transaction.date.substring(0, 4))),
  ).sort((a, b) => b.localeCompare(a));
}

function getSortedCountMap<T>(
  items: T[],
  getKey: (item: T) => string,
): { keys: string[]; countMap: Map<string, number> } {
  const countMap = countBy(items, getKey);
  const keys = Array.from(countMap.keys()).sort(
    (a, b) => (countMap.get(b) ?? 0) - (countMap.get(a) ?? 0),
  );
  return { keys, countMap };
}

function computeTransactionKpi(transactions: Transaction[]): TransactionKpi {
  let totalIncome = 0;
  let totalExpense = 0;
  let count = 0;
  const expenseAmounts: number[] = [];

  for (const t of transactions) {
    // 計算対象外のトランザクションはKPIから除外
    if (t.isExcludedFromCalculation) continue;

    if (t.type === "income") {
      totalIncome += t.amount;
      count++;
    } else if (t.type === "expense") {
      totalExpense += t.amount;
      expenseAmounts.push(t.amount);
      count++;
    }
  }

  // 中央値計算
  let medianExpense = 0;
  if (expenseAmounts.length > 0) {
    const sorted = [...expenseAmounts].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianExpense =
      sorted.length % 2 === 0 ? Math.floor((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  }

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    count,
    medianExpense,
  };
}

export function useTransactionFiltering({
  transactions,
  selectedDate,
  pageSize,
  yearFilterEnabled = false,
}: UseTransactionFilteringOptions) {
  const availableYears = useMemo(() => getAvailableYears(transactions), [transactions]);
  const [preferredYear, setPreferredYear] = useState<string | null>(
    yearFilterEnabled ? (availableYears[0] ?? null) : null,
  );
  let selectedYear: string | null = null;
  if (yearFilterEnabled) {
    selectedYear =
      preferredYear && availableYears.includes(preferredYear)
        ? preferredYear
        : (availableYears[0] ?? null);
  }
  const [searchText, setSearchText] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const transactionsInSelectedYear = useMemo(
    () => filterTransactionsByYear(transactions, selectedYear),
    [transactions, selectedYear],
  );

  // Get unique categories with count, sorted by count descending
  const { keys: categories, countMap: categoryCount } = useMemo(
    () => getSortedCountMap(transactionsInSelectedYear, (t) => t.category ?? "振替"),
    [transactionsInSelectedYear],
  );

  // Get unique accounts with count, sorted by count descending
  const { keys: accounts, countMap: accountCount } = useMemo(
    () => getSortedCountMap(transactionsInSelectedYear, (t) => t.accountName ?? "不明"),
    [transactionsInSelectedYear],
  );

  // Filter and sort transactions using pure functions
  const filteredAndSortedTransactions = useMemo(() => {
    const filtered = filterTransactions(transactionsInSelectedYear, {
      searchText,
      categories: selectedCategories,
      types: selectedTypes,
      accounts: selectedAccounts,
      date: selectedDate,
    });
    return sortTransactions(filtered, sortColumn, sortDirection);
  }, [
    transactionsInSelectedYear,
    searchText,
    selectedCategories,
    selectedTypes,
    selectedAccounts,
    selectedDate,
    sortColumn,
    sortDirection,
  ]);

  // KPI summary (excludes transfers and isExcludedFromCalculation)
  const kpi = useMemo(
    () => computeTransactionKpi(filteredAndSortedTransactions),
    [filteredAndSortedTransactions],
  );

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedTransactions.length / pageSize);
  const displayedPage = Math.min(currentPage, Math.max(totalPages - 1, 0));
  const paginatedTransactions = filteredAndSortedTransactions.slice(
    displayedPage * pageSize,
    (displayedPage + 1) * pageSize,
  );

  const resetPage = () => {
    setCurrentPage(0);
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column as SortColumn);
      setSortDirection("desc");
    }
    resetPage();
  };

  const handleSearchChange = (value: string) => {
    setSearchText(value);
    resetPage();
  };

  const handleYearChange = (year: string) => {
    setPreferredYear(year);
    resetPage();
  };

  const handleCategoriesChange = (categories: string[]) => {
    setSelectedCategories(categories);
    resetPage();
  };

  const handleTypesChange = (types: string[]) => {
    setSelectedTypes(types);
    resetPage();
  };

  const handleAccountsChange = (accounts: string[]) => {
    setSelectedAccounts(accounts);
    resetPage();
  };

  const handleRemoveCategory = (category: string) => {
    setSelectedCategories((values) => values.filter((item) => item !== category));
    resetPage();
  };

  const handleRemoveType = (type: string) => {
    setSelectedTypes((values) => values.filter((item) => item !== type));
    resetPage();
  };

  const handleRemoveAccount = (account: string) => {
    setSelectedAccounts((values) => values.filter((item) => item !== account));
    resetPage();
  };

  const handleClearFilters = (onDateChange?: (date: string | null) => void) => {
    setSelectedCategories([]);
    setSelectedTypes([]);
    setSelectedAccounts([]);
    onDateChange?.(null);
    resetPage();
  };

  return {
    // State
    searchText,
    selectedCategories,
    selectedTypes,
    selectedAccounts,
    selectedYear,
    currentPage: displayedPage,
    sortColumn,
    sortDirection,
    // Computed
    categories,
    categoryCount,
    accounts,
    accountCount,
    typeOptions: TYPE_OPTIONS,
    availableYears,
    filteredAndSortedTransactions,
    paginatedTransactions,
    kpi,
    totalPages,
    // Handlers
    handleSort,
    handleSearchChange,
    handleYearChange,
    handleCategoriesChange,
    handleTypesChange,
    handleAccountsChange,
    handleRemoveCategory,
    handleRemoveType,
    handleRemoveAccount,
    handleClearFilters,
    setCurrentPage,
  };
}
