import { financeChatCardsSchema, type FinanceChatCard } from "../chat/cards";
import type { FinanceChatEvaluationCase, FinanceChatToolExpectation } from "./finance-chat-cases";

const NAVIGATION_TOOL = "getFinanceDashboardRoute";
const PRESENTATION_TOOL = "presentFinanceCards";

interface FinanceChatToolCall {
  toolName: string;
  input: unknown;
  invalid?: boolean;
}

interface FinanceChatToolResult {
  toolName: string;
  output: unknown;
}

export interface FinanceChatEvaluationTrace {
  steps: readonly FinanceChatEvaluationStep[];
}

interface FinanceChatEvaluationStep {
  toolCalls: readonly FinanceChatToolCall[];
  toolResults: readonly FinanceChatToolResult[];
}

export interface FinanceChatEvaluationResult {
  passed: boolean;
  violations: string[];
  toolNames: string[];
  cardTypes: FinanceChatCard["type"][];
}

function getCardHrefs(cards: FinanceChatCard[]): string[] {
  return cards.flatMap((card) => {
    if ("href" in card && card.href !== undefined) return [card.href];
    if ("action" in card && card.action !== undefined) return [card.action.href];
    return [];
  });
}

function getNavigationHrefs(toolResults: readonly FinanceChatToolResult[]): Set<string> {
  return new Set(
    toolResults.flatMap((result) => {
      if (result.toolName !== NAVIGATION_TOOL) return [];
      if (typeof result.output !== "object" || result.output === null) return [];

      const href = Reflect.get(result.output, "href");
      return typeof href === "string" ? [href] : [];
    }),
  );
}

function findDuplicateDataCalls(toolCalls: readonly FinanceChatToolCall[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const call of toolCalls) {
    if (call.toolName === NAVIGATION_TOOL || call.toolName === PRESENTATION_TOOL) continue;

    const key = `${call.toolName}:${JSON.stringify(call.input)}`;
    if (seen.has(key)) duplicates.add(call.toolName);
    seen.add(key);
  }

  return [...duplicates];
}

function matchesExpectedInput(
  input: unknown,
  expected: Readonly<Record<string, unknown>>,
): boolean {
  if (typeof input !== "object" || input === null) return false;
  return Object.entries(expected).every(([key, value]) => Reflect.get(input, key) === value);
}

function matchesToolExpectation(
  toolCalls: readonly FinanceChatToolCall[],
  expectation: FinanceChatToolExpectation,
): boolean {
  return toolCalls.some(
    ({ toolName, input }) =>
      toolName === expectation.name &&
      (expectation.input === undefined || matchesExpectedInput(input, expectation.input)),
  );
}

function isDataTool(toolName: string): boolean {
  return toolName !== NAVIGATION_TOOL && toolName !== PRESENTATION_TOOL;
}

export function evaluateFinanceChatTrace(
  evaluationCase: FinanceChatEvaluationCase,
  trace: FinanceChatEvaluationTrace,
): FinanceChatEvaluationResult {
  const violations: string[] = [];
  const toolCalls = trace.steps.flatMap(({ toolCalls }) => toolCalls);
  const toolResults = trace.steps.flatMap(({ toolResults }) => toolResults);
  const toolNames = toolCalls.map(({ toolName }) => toolName);

  const matchedStrategy = evaluationCase.toolStrategies.some(
    (strategy) =>
      strategy.every((expectation) => matchesToolExpectation(toolCalls, expectation)) &&
      toolCalls
        .filter(({ toolName }) => isDataTool(toolName))
        .every(({ toolName }) => strategy.some(({ name }) => name === toolName)),
  );
  if (!matchedStrategy) {
    violations.push("必須ツールまたは引数が期待する戦略を満たさない");
  }

  if (toolCalls.some(({ invalid }) => invalid)) {
    violations.push("不正なツール呼び出しが含まれる");
  }

  const duplicateDataCalls = findDuplicateDataCalls(toolCalls);
  if (duplicateDataCalls.length > 0) {
    violations.push(`同一データの重複取得: ${duplicateDataCalls.join(", ")}`);
  }

  const unexpectedDataTools = toolNames.filter(
    (toolName) => isDataTool(toolName) && !evaluationCase.allowedDataTools.includes(toolName),
  );
  if (unexpectedDataTools.length > 0) {
    violations.push(`許可されていないデータ取得: ${[...new Set(unexpectedDataTools)].join(", ")}`);
  }

  const presentationCalls = toolCalls.filter(({ toolName }) => toolName === PRESENTATION_TOOL);
  const presentationResults = toolResults.filter(({ toolName }) => toolName === PRESENTATION_TOOL);

  if (presentationCalls.length !== 1) {
    violations.push(`presentFinanceCards 呼び出し回数: ${presentationCalls.length}（期待値: 1）`);
  }
  if (presentationResults.length !== 1) {
    violations.push(`presentFinanceCards 結果数: ${presentationResults.length}（期待値: 1）`);
  }

  const parsedCards = financeChatCardsSchema.safeParse(presentationResults[0]?.output);
  if (!parsedCards.success) {
    violations.push("カード出力が financeChatCardsSchema を満たさない");
    return { passed: false, violations, toolNames, cardTypes: [] };
  }

  const cards = parsedCards.data;
  const cardTypes = cards.map(({ type }) => type);
  if (cardTypes.join(",") !== evaluationCase.expectedCardTypes.join(",")) {
    violations.push(
      `カード構成: ${cardTypes.join(" → ")}（期待値: ${evaluationCase.expectedCardTypes.join(" → ")}）`,
    );
  }

  const isEmpty = cards.length === 1 && cards[0]?.type === "empty";
  if (!isEmpty) {
    if (!toolNames.includes(NAVIGATION_TOOL)) {
      violations.push(`${NAVIGATION_TOOL} が呼び出されていない`);
    }

    const presentationStep = trace.steps.findIndex(({ toolCalls }) =>
      toolCalls.some(({ toolName }) => toolName === PRESENTATION_TOOL),
    );
    const navigationHrefs = getNavigationHrefs(
      trace.steps.slice(0, presentationStep).flatMap(({ toolResults }) => toolResults),
    );
    const unverifiedHrefs = getCardHrefs(cards).filter((href) => !navigationHrefs.has(href));
    if (unverifiedHrefs.length > 0) {
      violations.push(`ナビゲーションツール未検証の CTA: ${unverifiedHrefs.join(", ")}`);
    }
  }

  return { passed: violations.length === 0, violations, toolNames, cardTypes };
}
