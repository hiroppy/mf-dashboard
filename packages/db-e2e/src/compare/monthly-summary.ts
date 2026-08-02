export interface MonthlySummary {
  totalIncome: number;
  totalExpense: number;
}

export interface MonthlySummaryComparison {
  dbSummaryExists: boolean;
  totalIncomeMatch: boolean;
  totalExpenseMatch: boolean;
}

export function compareMonthlySummaries(
  scraped: MonthlySummary,
  db: MonthlySummary | null,
): MonthlySummaryComparison {
  return {
    dbSummaryExists: db !== null,
    totalIncomeMatch: db !== null && scraped.totalIncome === db.totalIncome,
    totalExpenseMatch: db !== null && scraped.totalExpense === db.totalExpense,
  };
}
