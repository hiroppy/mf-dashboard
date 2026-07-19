import { createFinanceChatTools } from "@mf-dashboard/analytics/chat/tools";
import { getModel, isLLMEnabled } from "@mf-dashboard/analytics/config";
import { closeDb, getCurrentGroup, getDb, isDatabaseAvailable } from "@mf-dashboard/db";
import { generateText, stepCountIs } from "ai";
import { FINANCE_CHAT_MAX_TOOL_STEPS, getFinanceChatSystemPrompt } from "../src/app/api/chat/route";
import { FINANCE_CHAT_EVALUATION_CASES } from "../src/evals/finance-chat-cases";
import { evaluateFinanceChatTrace } from "../src/evals/finance-chat-evaluator";

function getSelectedCases() {
  const caseId = process.argv.find((argument) => argument.startsWith("--case="))?.split("=")[1];
  if (!caseId) return FINANCE_CHAT_EVALUATION_CASES;

  const selected = FINANCE_CHAT_EVALUATION_CASES.filter(({ id }) => id === caseId);
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

  const selectedCases = getSelectedCases();
  const tools = createFinanceChatTools(db, group.id);
  const model = getModel();
  let failed = 0;

  for (const evaluationCase of selectedCases) {
    const response = await generateText({
      model,
      system: getFinanceChatSystemPrompt(),
      prompt: evaluationCase.prompt,
      tools,
      stopWhen: stepCountIs(FINANCE_CHAT_MAX_TOOL_STEPS),
    });
    const result = evaluateFinanceChatTrace(evaluationCase, {
      toolCalls: response.toolCalls,
      toolResults: response.toolResults,
    });

    if (!result.passed) failed += 1;
    console.log(
      JSON.stringify({
        id: evaluationCase.id,
        passed: result.passed,
        tools: result.toolNames,
        cards: result.cardTypes,
        violations: result.violations,
      }),
    );
  }

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
