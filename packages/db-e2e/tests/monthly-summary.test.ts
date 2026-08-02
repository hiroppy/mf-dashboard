import { describe, expect, test } from "vitest";
import { compareMonthlySummaries } from "../src/compare/monthly-summary";

describe("compareMonthlySummaries", () => {
  test("匿名の月次集計について収入・支出を独立して比較する", () => {
    expect(
      compareMonthlySummaries(
        { totalIncome: 300, totalExpense: 100 },
        { totalIncome: 300, totalExpense: 200 },
      ),
    ).toEqual({
      dbSummaryExists: true,
      totalIncomeMatch: true,
      totalExpenseMatch: false,
    });
  });

  test("DB集計がない場合はすべて不一致にする", () => {
    expect(compareMonthlySummaries({ totalIncome: 300, totalExpense: 100 }, null)).toEqual({
      dbSummaryExists: false,
      totalIncomeMatch: false,
      totalExpenseMatch: false,
    });
  });
});
