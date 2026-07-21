import { describe, expect, it, vi } from "vitest";
import type { FinanceChatEvaluationCase } from "./finance-chat-cases";
import type { FinanceChatEvaluationResult } from "./finance-chat-evaluator";
import { runFinanceChatEvaluationCases } from "./finance-chat-runner";

const evaluationCases = ["first", "second"].map(
  (id): FinanceChatEvaluationCase => ({
    id,
    prompt: id,
    toolStrategies: [[{ name: "getLatestMonthlySummary" }]],
    allowedDataTools: ["getLatestMonthlySummary"],
    navigationInput: { page: "cashFlow" },
    expectedCardTypes: ["summary"],
  }),
);

describe("runFinanceChatEvaluationCases", () => {
  it("records a provider error and continues with the remaining cases", async () => {
    const evaluateCase = vi
      .fn<(evaluationCase: FinanceChatEvaluationCase) => Promise<FinanceChatEvaluationResult>>()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({
        passed: true,
        violations: [],
        toolNames: ["getLatestMonthlySummary"],
        cardTypes: ["summary"],
      });

    const results = await runFinanceChatEvaluationCases(evaluationCases, evaluateCase);

    expect(evaluateCase).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      {
        id: "first",
        passed: false,
        violations: ["評価実行エラー: rate limited"],
        toolNames: [],
        cardTypes: [],
      },
      {
        id: "second",
        passed: true,
        violations: [],
        toolNames: ["getLatestMonthlySummary"],
        cardTypes: ["summary"],
      },
    ]);
  });
});
