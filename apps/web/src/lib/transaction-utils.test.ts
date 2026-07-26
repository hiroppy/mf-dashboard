import { describe, expect, it } from "vitest";
import type { Transaction } from "../components/info/transaction-table/types";
import {
  countBy,
  filterTransactions,
  filterTransactionsByYear,
  sortTransactions,
  type TransactionFilters,
} from "./transaction-utils";

const createTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 1,
  date: "2025-04-15",
  category: "食費",
  description: "ランチ",
  amount: 1000,
  type: "expense",
  isTransfer: false,
  isExcludedFromCalculation: false,
  accountName: "銀行A",
  ...overrides,
});

describe("countBy", () => {
  it("counts items by key", () => {
    const items = [{ name: "apple" }, { name: "banana" }, { name: "apple" }, { name: "cherry" }];
    const result = countBy(items, (i) => i.name);
    expect(result.get("apple")).toBe(2);
    expect(result.get("banana")).toBe(1);
    expect(result.get("cherry")).toBe(1);
  });

  it("returns empty map for empty array", () => {
    const result = countBy([], (i: { name: string }) => i.name);
    expect(result.size).toBe(0);
  });
});

describe("filterTransactions", () => {
  const transactions: Transaction[] = [
    createTransaction({
      id: 1,
      category: "食費",
      description: "ランチ",
      type: "expense",
      accountName: "銀行A",
    }),
    createTransaction({
      id: 2,
      category: "交通費",
      description: "電車",
      type: "expense",
      accountName: "銀行B",
    }),
    createTransaction({
      id: 3,
      category: "給与",
      description: "月給",
      type: "income",
      accountName: "銀行A",
    }),
    createTransaction({
      id: 4,
      category: null,
      description: "振替",
      type: "transfer",
      accountName: null,
    }),
  ];

  const emptyFilters: TransactionFilters = {
    searchText: "",
    categories: [],
    types: [],
    accounts: [],
    date: null,
  };

  it("returns all transactions when no filters applied", () => {
    const result = filterTransactions(transactions, emptyFilters);
    expect(result).toHaveLength(4);
  });

  it("filters by search text in description", () => {
    const filters = { ...emptyFilters, searchText: "ランチ" };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("ランチ");
  });

  it("filters by search text in category", () => {
    const filters = { ...emptyFilters, searchText: "食費" };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("食費");
  });

  it("filters by categories", () => {
    const filters = { ...emptyFilters, categories: ["食費", "交通費"] };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(2);
  });

  it("filters by types", () => {
    const filters = { ...emptyFilters, types: ["income"] };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("income");
  });

  it("filters by accounts", () => {
    const filters = { ...emptyFilters, accounts: ["銀行A"] };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(2);
  });

  it("filters by date", () => {
    const txWithDates = [
      createTransaction({ id: 1, date: "2025-04-15" }),
      createTransaction({ id: 2, date: "2025-04-16" }),
    ];
    const filters = { ...emptyFilters, date: "2025-04-15" };
    const result = filterTransactions(txWithDates, filters);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2025-04-15");
  });

  it("handles null category as 振替", () => {
    const filters = { ...emptyFilters, categories: ["振替"] };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBeNull();
  });

  it("combines multiple filters with AND logic", () => {
    const filters = {
      ...emptyFilters,
      types: ["expense"],
      accounts: ["銀行A"],
    };
    const result = filterTransactions(transactions, filters);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("食費");
  });
});

describe("filterTransactionsByYear", () => {
  const transactions = [
    createTransaction({ id: 1, date: "2024-12-31" }),
    createTransaction({ id: 2, date: "2025-01-01" }),
    createTransaction({ id: 3, date: "2025-12-31" }),
    createTransaction({ id: 4, date: "2026-01-01" }),
  ];

  it("includes the selected year's boundary dates", () => {
    const result = filterTransactionsByYear(transactions, "2025");

    expect(result.map(({ id }) => id)).toEqual([2, 3]);
  });

  it("returns all transactions when no year is selected", () => {
    expect(filterTransactionsByYear(transactions, null)).toBe(transactions);
  });
});

describe("sortTransactions", () => {
  const transactions: Transaction[] = [
    createTransaction({ id: 1, date: "2025-04-15", amount: 500, description: "B" }),
    createTransaction({ id: 2, date: "2025-04-10", amount: 1000, description: "A" }),
    createTransaction({ id: 3, date: "2025-04-20", amount: 200, description: "C" }),
  ];

  it("sorts by date ascending", () => {
    const result = sortTransactions(transactions, "date", "asc");
    expect(result.map((t) => t.date)).toEqual(["2025-04-10", "2025-04-15", "2025-04-20"]);
  });

  it("sorts by date descending", () => {
    const result = sortTransactions(transactions, "date", "desc");
    expect(result.map((t) => t.date)).toEqual(["2025-04-20", "2025-04-15", "2025-04-10"]);
  });

  it("sorts by description", () => {
    const result = sortTransactions(transactions, "description", "asc");
    expect(result.map((t) => t.description)).toEqual(["A", "B", "C"]);
  });

  it("sorts by amount with signed values", () => {
    const txWithTypes = [
      createTransaction({ id: 1, amount: 1000, type: "income" }),
      createTransaction({ id: 2, amount: 500, type: "expense" }),
      createTransaction({ id: 3, amount: 200, type: "income" }),
    ];
    const result = sortTransactions(txWithTypes, "amount", "asc");
    // expense: -500, income: 200, income: 1000
    expect(result.map((t) => t.amount)).toEqual([500, 200, 1000]);
  });

  it("does not mutate original array", () => {
    const original = [...transactions];
    sortTransactions(transactions, "date", "asc");
    expect(transactions).toEqual(original);
  });
});
