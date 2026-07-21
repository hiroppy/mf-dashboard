import type { FinanceChatEvaluationCase } from "./finance-chat-cases";
import type { FinanceChatEvaluationResult } from "./finance-chat-evaluator";

export interface FinanceChatCaseResult extends FinanceChatEvaluationResult {
  id: string;
}

export async function runFinanceChatEvaluationCases(
  evaluationCases: readonly FinanceChatEvaluationCase[],
  evaluateCase: (evaluationCase: FinanceChatEvaluationCase) => Promise<FinanceChatEvaluationResult>,
): Promise<FinanceChatCaseResult[]> {
  const results: FinanceChatCaseResult[] = [];

  for (const evaluationCase of evaluationCases) {
    try {
      results.push({ id: evaluationCase.id, ...(await evaluateCase(evaluationCase)) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        id: evaluationCase.id,
        passed: false,
        violations: [`評価実行エラー: ${message}`],
        toolNames: [],
        cardTypes: [],
      });
    }
  }

  return results;
}
