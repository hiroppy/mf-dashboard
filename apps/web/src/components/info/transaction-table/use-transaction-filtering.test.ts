import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Transaction } from "./types";
import { useTransactionFiltering } from "./use-transaction-filtering";

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

const sampleTransactions: Transaction[] = [
  createTransaction({
    id: 1,
    category: "食費",
    type: "expense",
    amount: 1000,
    accountName: "銀行A",
  }),
  createTransaction({
    id: 2,
    category: "食費",
    type: "expense",
    amount: 2000,
    accountName: "銀行A",
  }),
  createTransaction({
    id: 3,
    category: "交通費",
    type: "expense",
    amount: 500,
    accountName: "銀行B",
  }),
  createTransaction({
    id: 4,
    category: "給与",
    type: "income",
    amount: 300000,
    accountName: "銀行A",
  }),
  createTransaction({
    id: 5,
    category: null,
    type: "transfer",
    amount: 10000,
    accountName: null,
    isTransfer: true,
  }),
];

describe("useTransactionFiltering", () => {
  const defaultOptions = {
    transactions: sampleTransactions,
    selectedDate: null,
    pageSize: 10,
  };

  describe("初期状態", () => {
    it("フィルタが初期値で設定される", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      expect(result.current.searchText).toBe("");
      expect(result.current.selectedCategories).toEqual([]);
      expect(result.current.selectedTypes).toEqual([]);
      expect(result.current.selectedAccounts).toEqual([]);
      expect(result.current.currentPage).toBe(0);
      expect(result.current.sortColumn).toBe("date");
      expect(result.current.sortDirection).toBe("desc");
    });

    it("全トランザクションが表示される", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      expect(result.current.filteredAndSortedTransactions).toHaveLength(5);
    });

    it("カテゴリ一覧がカウント順でソートされる", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      // 食費が2件で最も多い
      expect(result.current.categories[0]).toBe("食費");
      expect(result.current.categoryCount.get("食費")).toBe(2);
    });
  });

  describe("年フィルタ", () => {
    const transactions = [
      createTransaction({ id: 1, date: "2026-01-01", category: "2026年カテゴリー" }),
      createTransaction({ id: 2, date: "2025-12-31", category: "2025年カテゴリー" }),
      createTransaction({ id: 3, date: "2025-01-01", category: "2025年カテゴリー" }),
      createTransaction({ id: 4, date: "2024-12-31", category: "2024年カテゴリー" }),
    ];

    it("利用可能な年を降順で返し、最新年を初期選択する", () => {
      const { result } = renderHook(() =>
        useTransactionFiltering({
          ...defaultOptions,
          transactions,
          yearFilterEnabled: true,
        }),
      );

      expect(result.current.availableYears).toEqual(["2026", "2025", "2024"]);
      expect(result.current.selectedYear).toBe("2026");
      expect(result.current.categories).toEqual(["2026年カテゴリー"]);
      expect(result.current.filteredAndSortedTransactions.map(({ id }) => id)).toEqual([1]);
    });

    it("選択年の年初から年末までに絞り込み、ページを先頭に戻す", () => {
      const { result } = renderHook(() =>
        useTransactionFiltering({
          ...defaultOptions,
          transactions,
          yearFilterEnabled: true,
        }),
      );

      act(() => {
        result.current.setCurrentPage(2);
        result.current.handleYearChange("2025");
      });

      expect(result.current.currentPage).toBe(0);
      expect(result.current.categories).toEqual(["2025年カテゴリー"]);
      expect(result.current.filteredAndSortedTransactions.map(({ id }) => id)).toEqual([2, 3]);
    });

    it("データ更新で選択年がなくなった場合は最新の利用可能年へ切り替える", () => {
      const { result, rerender } = renderHook(
        ({ currentTransactions }) =>
          useTransactionFiltering({
            ...defaultOptions,
            transactions: currentTransactions,
            yearFilterEnabled: true,
          }),
        { initialProps: { currentTransactions: transactions } },
      );

      expect(result.current.selectedYear).toBe("2026");

      rerender({ currentTransactions: transactions.slice(1) });

      expect(result.current.availableYears).toEqual(["2025", "2024"]);
      expect(result.current.selectedYear).toBe("2025");
      expect(result.current.filteredAndSortedTransactions.map(({ id }) => id)).toEqual([2, 3]);
    });

    it("データ更新で別の年へ切り替わる場合はページを有効範囲に収める", () => {
      const initialTransactions = [
        createTransaction({ id: 1, date: "2026-03-01" }),
        createTransaction({ id: 2, date: "2026-02-01" }),
        createTransaction({ id: 3, date: "2026-01-01" }),
        createTransaction({ id: 4, date: "2025-12-31" }),
      ];
      const { result, rerender } = renderHook(
        ({ currentTransactions }) =>
          useTransactionFiltering({
            ...defaultOptions,
            transactions: currentTransactions,
            pageSize: 1,
            yearFilterEnabled: true,
          }),
        { initialProps: { currentTransactions: initialTransactions } },
      );

      act(() => {
        result.current.setCurrentPage(2);
      });
      expect(result.current.currentPage).toBe(2);

      rerender({ currentTransactions: initialTransactions.slice(3) });

      expect(result.current.selectedYear).toBe("2025");
      expect(result.current.currentPage).toBe(0);
      expect(result.current.paginatedTransactions.map(({ id }) => id)).toEqual([4]);
    });

    it("年フィルタの有効状態に合わせて選択年と表示対象を切り替える", () => {
      const { result, rerender } = renderHook(
        ({ yearFilterEnabled }) =>
          useTransactionFiltering({
            ...defaultOptions,
            transactions,
            yearFilterEnabled,
          }),
        { initialProps: { yearFilterEnabled: false } },
      );

      expect(result.current.selectedYear).toBeNull();
      expect(result.current.filteredAndSortedTransactions).toHaveLength(4);

      rerender({ yearFilterEnabled: true });

      expect(result.current.selectedYear).toBe("2026");
      expect(result.current.filteredAndSortedTransactions.map(({ id }) => id)).toEqual([1]);

      rerender({ yearFilterEnabled: false });

      expect(result.current.selectedYear).toBeNull();
      expect(result.current.filteredAndSortedTransactions).toHaveLength(4);
    });
  });

  describe("KPI計算", () => {
    it("収入と支出の合計を計算する", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      expect(result.current.kpi.totalIncome).toBe(300000);
      expect(result.current.kpi.totalExpense).toBe(3500); // 1000 + 2000 + 500
      expect(result.current.kpi.balance).toBe(296500);
    });

    it("支出の中央値を計算する", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      // 支出: 500, 1000, 2000 -> 中央値: 1000
      expect(result.current.kpi.medianExpense).toBe(1000);
    });

    it("transferはKPIから除外される", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      // count: income 1件 + expense 3件 = 4件（transferは除外）
      expect(result.current.kpi.count).toBe(4);
    });

    it("isExcludedFromCalculation=trueのトランザクションはKPIから除外される", () => {
      const transactions = [
        createTransaction({
          id: 1,
          type: "expense",
          amount: 1000,
          isExcludedFromCalculation: false,
        }),
        createTransaction({
          id: 2,
          type: "expense",
          amount: 2000,
          isExcludedFromCalculation: true,
        }),
      ];
      const { result } = renderHook(() =>
        useTransactionFiltering({ ...defaultOptions, transactions }),
      );

      expect(result.current.kpi.totalExpense).toBe(1000);
      expect(result.current.kpi.count).toBe(1);
    });
  });

  describe("検索フィルタ", () => {
    it("検索時にページがリセットされる", () => {
      const { result } = renderHook(() =>
        useTransactionFiltering({ ...defaultOptions, pageSize: 1 }),
      );

      act(() => {
        result.current.setCurrentPage(2);
      });
      expect(result.current.currentPage).toBe(2);

      act(() => {
        result.current.handleSearchChange("test");
      });
      expect(result.current.currentPage).toBe(0);
    });
  });

  describe("カテゴリフィルタ", () => {
    it("カテゴリでフィルタできる", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      act(() => {
        result.current.handleCategoriesChange(["食費"]);
      });

      expect(result.current.filteredAndSortedTransactions).toHaveLength(2);
      expect(result.current.selectedCategories).toEqual(["食費"]);
    });

    it("カテゴリを削除できる", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      act(() => {
        result.current.handleCategoriesChange(["食費", "交通費"]);
      });

      act(() => {
        result.current.handleRemoveCategory("食費");
      });

      expect(result.current.selectedCategories).toEqual(["交通費"]);
    });
  });

  describe("タイプフィルタ", () => {
    it("タイプを削除できる", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      act(() => {
        result.current.handleTypesChange(["income", "expense"]);
      });

      act(() => {
        result.current.handleRemoveType("income");
      });

      expect(result.current.selectedTypes).toEqual(["expense"]);
    });
  });

  describe("アカウントフィルタ", () => {
    it("アカウントを削除できる", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      act(() => {
        result.current.handleAccountsChange(["銀行A", "銀行B"]);
      });

      act(() => {
        result.current.handleRemoveAccount("銀行A");
      });

      expect(result.current.selectedAccounts).toEqual(["銀行B"]);
    });
  });

  describe("フィルタ配線", () => {
    it("検索・タイプ・アカウントを組み合わせてフィルタする", () => {
      const transactions = [
        createTransaction({ id: 1, description: "ランチ", type: "expense", accountName: "銀行A" }),
        createTransaction({
          id: 2,
          description: "ディナー",
          type: "expense",
          accountName: "銀行A",
        }),
        createTransaction({ id: 3, description: "ランチ", type: "income", accountName: "銀行A" }),
        createTransaction({ id: 4, description: "ランチ", type: "expense", accountName: "銀行B" }),
      ];
      const { result } = renderHook(() =>
        useTransactionFiltering({ ...defaultOptions, transactions }),
      );

      act(() => {
        result.current.handleSearchChange("ランチ");
        result.current.handleTypesChange(["expense"]);
        result.current.handleAccountsChange(["銀行A"]);
      });

      expect(result.current.filteredAndSortedTransactions.map(({ id }) => id)).toEqual([1]);
    });
  });

  describe("ソート", () => {
    it("同じカラムをクリックすると方向が反転する", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      expect(result.current.sortDirection).toBe("desc");

      act(() => {
        result.current.handleSort("date");
      });

      expect(result.current.sortDirection).toBe("asc");
    });

    it("別のカラムをクリックするとdescでソートされる", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      act(() => {
        result.current.handleSort("amount");
      });

      expect(result.current.sortColumn).toBe("amount");
      expect(result.current.sortDirection).toBe("desc");
    });

    it("ソート時にページがリセットされる", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      act(() => {
        result.current.setCurrentPage(2);
      });

      act(() => {
        result.current.handleSort("amount");
      });

      expect(result.current.currentPage).toBe(0);
    });
  });

  describe("ページネーション", () => {
    it("totalPagesが正しく計算される", () => {
      const transactions = Array.from({ length: 25 }, (_, i) => createTransaction({ id: i + 1 }));
      const { result } = renderHook(() =>
        useTransactionFiltering({ ...defaultOptions, transactions, pageSize: 10 }),
      );

      expect(result.current.totalPages).toBe(3);
    });

    it("paginatedTransactionsが正しいページのデータを返す", () => {
      const transactions = Array.from({ length: 25 }, (_, i) => createTransaction({ id: i + 1 }));
      const { result } = renderHook(() =>
        useTransactionFiltering({ ...defaultOptions, transactions, pageSize: 10 }),
      );

      expect(result.current.paginatedTransactions).toHaveLength(10);

      act(() => {
        result.current.setCurrentPage(2);
      });

      expect(result.current.paginatedTransactions).toHaveLength(5);
    });
  });

  describe("フィルタクリア", () => {
    it("全てのフィルタをクリアできる", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));

      act(() => {
        result.current.handleCategoriesChange(["食費"]);
        result.current.handleTypesChange(["expense"]);
        result.current.handleAccountsChange(["銀行A"]);
        result.current.setCurrentPage(1);
      });

      act(() => {
        result.current.handleClearFilters();
      });

      expect(result.current.selectedCategories).toEqual([]);
      expect(result.current.selectedTypes).toEqual([]);
      expect(result.current.selectedAccounts).toEqual([]);
      expect(result.current.currentPage).toBe(0);
    });

    it("日付変更コールバックが呼ばれる", () => {
      const { result } = renderHook(() => useTransactionFiltering(defaultOptions));
      let dateValue: string | null = "2025-04-15";

      act(() => {
        result.current.handleClearFilters((date) => {
          dateValue = date;
        });
      });

      expect(dateValue).toBeNull();
    });
  });
});
