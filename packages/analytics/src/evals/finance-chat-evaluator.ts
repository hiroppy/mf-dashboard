import { financeChatCardsSchema, type FinanceChatCard } from "../chat/cards";
import type { FinanceChatEvaluationCase, FinanceChatToolExpectation } from "./finance-chat-cases";

const NAVIGATION_TOOL = "getFinanceDashboardRoute";
const PRESENTATION_TOOL = "presentFinanceCards";

interface FinanceChatToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
  invalid?: boolean;
}

interface FinanceChatToolResult {
  toolCallId: string;
  toolName: string;
  output: unknown;
}

export interface FinanceChatEvaluationTrace {
  steps: readonly FinanceChatEvaluationStep[];
  text?: string;
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

function getNavigationHrefs(
  toolCalls: readonly FinanceChatToolCall[],
  toolResults: readonly FinanceChatToolResult[],
  expectedInput: Readonly<Record<string, unknown>>,
): Set<string> {
  const expectedCallIds = new Set(
    toolCalls
      .filter((call) => call.toolName === NAVIGATION_TOOL && inputsEqual(call.input, expectedInput))
      .map(({ toolCallId }) => toolCallId),
  );

  return new Set(
    toolResults.flatMap((result) => {
      if (result.toolName !== NAVIGATION_TOOL || !expectedCallIds.has(result.toolCallId)) return [];
      if (typeof result.output !== "object" || result.output === null) return [];

      const href = Reflect.get(result.output, "href");
      return typeof href === "string" ? [href] : [];
    }),
  );
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value !== "object" || value === null) return JSON.stringify(value) ?? "undefined";

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
}

function findDuplicateDataCalls(toolCalls: readonly FinanceChatToolCall[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const call of toolCalls) {
    if (call.toolName === NAVIGATION_TOOL || call.toolName === PRESENTATION_TOOL) continue;

    const key = `${call.toolName}:${canonicalize(call.input)}`;
    if (seen.has(key)) duplicates.add(call.toolName);
    seen.add(key);
  }

  return [...duplicates];
}

function inputsEqual(input: unknown, expected: Readonly<Record<string, unknown>> = {}): boolean {
  return canonicalize(input) === canonicalize(expected);
}

function matchesToolExpectation(
  toolCalls: readonly FinanceChatToolCall[],
  expectation: FinanceChatToolExpectation,
): boolean {
  return toolCalls.some(
    ({ toolName, input }) => toolName === expectation.name && inputsEqual(input, expectation.input),
  );
}

function hasMatchingResult(
  call: FinanceChatToolCall,
  toolResults: readonly FinanceChatToolResult[],
): boolean {
  return toolResults.some(
    (result) => result.toolCallId === call.toolCallId && result.toolName === call.toolName,
  );
}

function matchesStrategy(
  strategy: readonly FinanceChatToolExpectation[],
  dataCalls: readonly FinanceChatToolCall[],
  completedPriorDataCalls: readonly FinanceChatToolCall[],
): boolean {
  if (dataCalls.length !== strategy.length) return false;

  return (
    dataCalls.every((call) =>
      strategy.some(
        (expectation) =>
          call.toolName === expectation.name && inputsEqual(call.input, expectation.input),
      ),
    ) &&
    strategy.every((expectation) => matchesToolExpectation(completedPriorDataCalls, expectation))
  );
}

function isDataTool(toolName: string): boolean {
  return toolName !== NAVIGATION_TOOL && toolName !== PRESENTATION_TOOL;
}

interface GroundedValues {
  numbers: number[];
  strings: Set<string>;
}

function collectGroundedValues(value: unknown, grounded: GroundedValues): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    grounded.numbers.push(value);
    grounded.strings.add(String(value));
    return;
  }
  if (typeof value === "string") {
    grounded.strings.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectGroundedValues(entry, grounded);

    const amounts = value.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const amount = Reflect.get(entry, "amount");
      return typeof amount === "number" && Number.isFinite(amount) ? [amount] : [];
    });
    if (amounts.length > 0) grounded.numbers.push(amounts.reduce((sum, amount) => sum + amount, 0));
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const entry of Object.values(value)) collectGroundedValues(entry, grounded);
  }
}

function isGroundedNumber(claim: number, sourceNumbers: readonly number[]): boolean {
  const equalsClaim = (value: number) => Math.abs(value - claim) < 0.01;
  if (sourceNumbers.some(equalsClaim)) return true;

  for (const left of sourceNumbers) {
    for (const right of sourceNumbers) {
      if (equalsClaim(left + right) || equalsClaim(left - right)) return true;
      if (right !== 0 && equalsClaim((left / right) * 100)) return true;
    }
  }
  return false;
}

function getCardClaims(cards: readonly FinanceChatCard[]): {
  numbers: number[];
  strings: string[];
} {
  const numbers: number[] = [];
  const strings: string[] = [];

  for (const card of cards) {
    if (card.type === "summary") numbers.push(...card.metrics.map(({ amount }) => amount));
    if (card.type === "insight" && card.amount !== undefined) numbers.push(card.amount);
    if (card.type === "chart") numbers.push(...card.data.flatMap(({ values }) => values));
    if (card.type === "categoryBreakdown") {
      for (const category of card.categories) {
        numbers.push(category.amount, category.percentage);
        strings.push(category.name);
      }
    }
    if (card.type === "transactionList") {
      for (const transaction of card.transactions) {
        numbers.push(transaction.amount);
        strings.push(
          transaction.id,
          transaction.date,
          transaction.description,
          ...(transaction.category === undefined ? [] : [transaction.category]),
        );
      }
    }
  }

  return { numbers, strings };
}

function extractFinancialClaims(text: string): number[] {
  const claims: number[] = [];
  const pattern = /(?:¥\s*)?(-?\d[\d,]*(?:\.\d+)?)\s*(兆|億|万|千)?\s*(円|%|％)/g;
  const multipliers: Record<string, number> = {
    兆: 1_000_000_000_000,
    億: 100_000_000,
    万: 10_000,
    千: 1_000,
  };

  for (const match of text.matchAll(pattern)) {
    const value = Number(match[1]?.replaceAll(",", ""));
    claims.push(value * (multipliers[match[2] ?? ""] ?? 1));
  }
  return claims;
}

export function evaluateFinanceChatTrace(
  evaluationCase: FinanceChatEvaluationCase,
  trace: FinanceChatEvaluationTrace,
): FinanceChatEvaluationResult {
  const violations: string[] = [];
  const toolCalls = trace.steps.flatMap(({ toolCalls }) => toolCalls);
  const toolResults = trace.steps.flatMap(({ toolResults }) => toolResults);
  const toolNames = toolCalls.map(({ toolName }) => toolName);
  const presentationStep = trace.steps.findIndex(({ toolCalls }) =>
    toolCalls.some(({ toolName }) => toolName === PRESENTATION_TOOL),
  );
  const priorSteps = presentationStep < 0 ? [] : trace.steps.slice(0, presentationStep);
  const priorToolCalls = priorSteps.flatMap(({ toolCalls }) => toolCalls);
  const priorToolResults = priorSteps.flatMap(({ toolResults }) => toolResults);
  const dataCalls = toolCalls.filter(({ toolName }) => isDataTool(toolName));
  const completedPriorDataCalls = priorToolCalls.filter(
    (call) => isDataTool(call.toolName) && hasMatchingResult(call, priorToolResults),
  );

  const matchedStrategy = evaluationCase.toolStrategies.some((strategy) =>
    matchesStrategy(strategy, dataCalls, completedPriorDataCalls),
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

  const presentationCall = presentationCalls[0];
  const presentationResult = presentationCall
    ? presentationResults.find(
        (result) =>
          result.toolCallId === presentationCall.toolCallId &&
          result.toolName === PRESENTATION_TOOL,
      )
    : undefined;
  const parsedCards = financeChatCardsSchema.safeParse(presentationResult?.output);
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

  const grounded: GroundedValues = { numbers: [], strings: new Set() };
  for (const call of completedPriorDataCalls) {
    const result = priorToolResults.find(
      ({ toolCallId, toolName }) => toolCallId === call.toolCallId && toolName === call.toolName,
    );
    if (result) collectGroundedValues(result.output, grounded);
  }
  const cardClaims = getCardClaims(cards);
  const ungroundedCardNumbers = cardClaims.numbers.filter(
    (claim) => !isGroundedNumber(claim, grounded.numbers),
  );
  const ungroundedCardStrings = cardClaims.strings.filter((claim) => !grounded.strings.has(claim));
  if (ungroundedCardNumbers.length > 0 || ungroundedCardStrings.length > 0) {
    violations.push("カード内容に取得結果で根拠付けられない金融 claim が含まれる");
  }

  const finalTextSources = [...grounded.numbers, ...cardClaims.numbers];
  if (trace.text === undefined) {
    violations.push("最終回答テキストが評価 trace に含まれない");
  } else if (
    extractFinancialClaims(trace.text).some((claim) => !isGroundedNumber(claim, finalTextSources))
  ) {
    violations.push("最終回答に取得結果またはカードと一致しない金融 claim が含まれる");
  }

  const isEmpty = cards.length === 1 && cards[0]?.type === "empty";
  if (!isEmpty) {
    if (!toolNames.includes(NAVIGATION_TOOL)) {
      violations.push(`${NAVIGATION_TOOL} が呼び出されていない`);
    }

    const completedPriorNavigationCalls = priorToolCalls.filter(
      (call) => call.toolName === NAVIGATION_TOOL && hasMatchingResult(call, priorToolResults),
    );
    if (
      !matchesToolExpectation(completedPriorNavigationCalls, {
        name: NAVIGATION_TOOL,
        input: evaluationCase.navigationInput,
      })
    ) {
      violations.push("ナビゲーションツールの引数または呼び出し順が期待値を満たさない");
    }

    const navigationHrefs = getNavigationHrefs(
      priorToolCalls,
      priorToolResults,
      evaluationCase.navigationInput,
    );
    const unverifiedHrefs = getCardHrefs(cards).filter((href) => !navigationHrefs.has(href));
    if (unverifiedHrefs.length > 0) {
      violations.push(`ナビゲーションツール未検証の CTA: ${unverifiedHrefs.join(", ")}`);
    }
  }

  return { passed: violations.length === 0, violations, toolNames, cardTypes };
}
