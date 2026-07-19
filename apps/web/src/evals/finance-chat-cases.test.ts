import { describe, expect, it } from "vitest";
import { FINANCE_CHAT_EVALUATION_CASES } from "./finance-chat-cases";

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
      expect(evaluationCase.requiredTools.length).toBeGreaterThan(0);
      expect(evaluationCase.expectedCardTypes.length).toBeGreaterThan(0);
    }
  });
});
