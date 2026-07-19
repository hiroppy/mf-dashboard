import { describe, expect, it } from "vitest";
import {
  createFinanceChatEvaluationCases,
  FINANCE_CHAT_EVALUATION_CASES,
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
      expect(evaluationCase.expectedCardTypes.length).toBeGreaterThan(0);
    }
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
  });
});
