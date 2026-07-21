import { closeDb, getCurrentGroup, getDb, isDatabaseAvailable } from "@mf-dashboard/db";
import { generateText, stepCountIs } from "ai";
import { FINANCE_CHAT_MAX_TOOL_STEPS, getFinanceChatSystemPrompt } from "../src/chat/prompt";
import { createFinanceChatTools } from "../src/chat/tools";
import { getModel, isLLMEnabled } from "../src/config";
import {
  createFinanceChatEvaluationCases,
  getFinanceChatEvaluationDate,
} from "../src/evals/finance-chat-cases";
import { evaluateFinanceChatTrace } from "../src/evals/finance-chat-evaluator";
import { runFinanceChatEvaluationCases } from "../src/evals/finance-chat-runner";

function getSelectedCases(evaluationDate: Date) {
  const evaluationCases = createFinanceChatEvaluationCases(evaluationDate);
  const caseId = process.argv.find((argument) => argument.startsWith("--case="))?.split("=")[1];
  if (!caseId) return evaluationCases;

  const selected = evaluationCases.filter(({ id }) => id === caseId);
  if (selected.length === 0) throw new Error(`Unknown case: ${caseId}`);
  return selected;
}

async function main() {
  if (!isLLMEnabled()) {
    throw new Error("AI_PROVIDER、AI_MODEL、AI_API_KEY を設定してください。");
  }
  if (!isDatabaseAvailable()) {
    throw new Error(
      "demo.db がありません。先に pnpm --filter @mf-dashboard/db build:demo を実行してください。",
    );
  }

  const db = getDb();
  const group = await getCurrentGroup(db);
  if (!group) throw new Error("demo.db に current group がありません。");

  const evaluationDate = getFinanceChatEvaluationDate();
  const selectedCases = getSelectedCases(evaluationDate);
  const tools = createFinanceChatTools(db, group.id);
  const model = getModel();
  const results = await runFinanceChatEvaluationCases(selectedCases, async (evaluationCase) => {
    const response = await generateText({
      model,
      system: getFinanceChatSystemPrompt(evaluationDate),
      prompt: evaluationCase.prompt,
      tools,
      stopWhen: stepCountIs(FINANCE_CHAT_MAX_TOOL_STEPS),
    });
    return evaluateFinanceChatTrace(evaluationCase, {
      steps: response.steps,
      text: response.text,
    });
  });

  for (const result of results) {
    console.log(
      JSON.stringify({
        id: result.id,
        passed: result.passed,
        tools: result.toolNames,
        cards: result.cardTypes,
        violations: result.violations,
      }),
    );
  }

  const failed = results.filter(({ passed }) => !passed).length;
  console.log(
    JSON.stringify({ total: selectedCases.length, passed: selectedCases.length - failed, failed }),
  );
  if (failed > 0) process.exitCode = 1;
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
