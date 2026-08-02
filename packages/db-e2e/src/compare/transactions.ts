import type { CashFlowSummary } from "@mf-dashboard/db/types";

export interface TransactionSummary {
  count: number;
  totalIncome: number;
  totalExpense: number;
}

export interface TransactionComparison {
  countMatch: boolean;
  totalIncomeMatch: boolean;
  totalExpenseMatch: boolean;
}

export function summarizeCashFlow(cashFlow: CashFlowSummary): TransactionSummary {
  const count = cashFlow.items.filter(
    (item) => !item.isExcludedFromCalculation && !item.isTransfer,
  ).length;

  return {
    count,
    totalIncome: cashFlow.totalIncome,
    totalExpense: cashFlow.totalExpense,
  };
}

export function compareTransactionSummaries(
  scraped: TransactionSummary,
  db: TransactionSummary,
): TransactionComparison {
  return {
    countMatch: scraped.count === db.count,
    totalIncomeMatch: scraped.totalIncome === db.totalIncome,
    totalExpenseMatch: scraped.totalExpense === db.totalExpense,
  };
}
