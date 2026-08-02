import type { CashFlowItem, CashFlowSummary } from "@mf-dashboard/db/types";
import { describe, expect, test } from "vitest";
import { compareTransactionSummaries, summarizeCashFlow } from "../src/compare/transactions";

function transaction(overrides: Partial<CashFlowItem> = {}): CashFlowItem {
  return {
    mfId: "transaction-a",
    date: "2026-01-01",
    category: "Category A",
    subCategory: "Subcategory A",
    description: "Transaction A",
    amount: 100,
    type: "expense",
    isTransfer: false,
    isExcludedFromCalculation: false,
    ...overrides,
  };
}

describe("summarizeCashFlow", () => {
  test("振替と計算対象外を件数から除外し、サイト集計値を保持する", () => {
    const cashFlow: CashFlowSummary = {
      month: "2026-01",
      totalIncome: 300,
      totalExpense: 100,
      balance: 200,
      items: [
        transaction(),
        transaction({ mfId: "transaction-b", isTransfer: true, type: "transfer" }),
        transaction({ mfId: "transaction-c", isExcludedFromCalculation: true }),
      ],
    };

    expect(summarizeCashFlow(cashFlow)).toEqual({
      count: 1,
      totalIncome: 300,
      totalExpense: 100,
    });
  });
});

describe("compareTransactionSummaries", () => {
  test("件数・収入・支出を独立して比較する", () => {
    expect(
      compareTransactionSummaries(
        { count: 2, totalIncome: 300, totalExpense: 100 },
        { count: 3, totalIncome: 300, totalExpense: 200 },
      ),
    ).toEqual({
      countMatch: false,
      totalIncomeMatch: true,
      totalExpenseMatch: false,
    });
  });
});
