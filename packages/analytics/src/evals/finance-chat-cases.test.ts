import { describe, expect, it } from "vitest";
import {
  createFinanceChatEvaluationCases,
  FINANCE_CHAT_EVALUATION_CASES,
  getFinanceChatEvaluationDate,
} from "./finance-chat-cases";

describe("FINANCE_CHAT_EVALUATION_CASES", () => {
  it("covers the representative finance chat intents with unique IDs", () => {
    const ids = FINANCE_CHAT_EVALUATION_CASES.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "monthly-summary",
      "category-expense",
      "daily-expense",
      "total-assets",
      "spending-review",
    ]);
  });

  it("defines at least one expected data tool and card for every case", () => {
    for (const evaluationCase of FINANCE_CHAT_EVALUATION_CASES) {
      expect(evaluationCase.prompt).not.toHaveLength(0);
      expect(evaluationCase.toolStrategies.length).toBeGreaterThan(0);
      expect(evaluationCase.allowedDataTools.length).toBeGreaterThan(0);
      expect(evaluationCase.navigationInput).toHaveProperty("page");
      expect(evaluationCase.expectedCardTypes.length).toBeGreaterThan(0);
    }
  });

  it("requires current-month summary data for the monthly status case", () => {
    const monthlySummary = FINANCE_CHAT_EVALUATION_CASES.find(({ id }) => id === "monthly-summary");

    expect(monthlySummary?.toolStrategies).toEqual([[{ name: "getLatestMonthlySummary" }]]);
    expect(monthlySummary?.allowedDataTools).toEqual(["getLatestMonthlySummary"]);
  });

  it("requires actionable content for the spending review", () => {
    expect(
      FINANCE_CHAT_EVALUATION_CASES.find(({ id }) => id === "spending-review")
        ?.requireActionableInsight,
    ).toBe(true);
  });

  it("requires independent category tools to run in parallel", () => {
    const categoryExpense = FINANCE_CHAT_EVALUATION_CASES.find(
      ({ id }) => id === "category-expense",
    );

    expect(categoryExpense?.requireParallelTools).toBe(true);
    expect(categoryExpense?.requiredCategory).toBe("食費");
    expect(categoryExpense?.summaryAmountSource).toBe("requestedCategory");
    expect(
      FINANCE_CHAT_EVALUATION_CASES.find(({ id }) => id === "daily-expense")?.summaryAmountSource,
    ).toBe("transactionTotal");
    expect(
      FINANCE_CHAT_EVALUATION_CASES.every(({ requireParallelTools }) => requireParallelTools),
    ).toBe(true);
  });

  it("uses Asia/Tokyo for relative dates across a UTC month boundary", () => {
    const utcMonthEnd = new Date("2026-07-31T15:30:00.000Z");
    const cases = createFinanceChatEvaluationCases(utcMonthEnd);

    expect(cases.find(({ id }) => id === "category-expense")?.toolStrategies).toContainEqual([
      {
        name: "searchTransactions",
        input: { month: "2026-08", category: "食費", type: "expense" },
      },
      { name: "getMonthlyCategoryTotals", input: { month: "2026-08" } },
    ]);
    expect(cases.find(({ id }) => id === "category-expense")?.navigationInput).toEqual({
      page: "cashFlow",
      month: "2026-08",
    });
  });

  it("pins evaluation to the JST month end covered by demo data", () => {
    const middleOfMonth = new Date("2026-07-05T00:00:00.000Z");

    expect(getFinanceChatEvaluationDate(middleOfMonth).toISOString()).toBe(
      "2026-07-31T03:00:00.000Z",
    );
  });
});
