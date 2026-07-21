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

type FinancialUnit = "currency" | "percentage";

interface FinancialClaim {
  value: number;
  unit: FinancialUnit;
}

interface GroundedRecord {
  [key: string]: unknown;
}

interface GroundedValues {
  claims: FinancialClaim[];
  strings: Set<string>;
  records: GroundedRecord[];
}

function getFinancialUnit(key: string): FinancialUnit | undefined {
  const normalized = key.toLowerCase();
  if (/(?:rate|percentage|percent|pct)$/.test(normalized)) return "percentage";
  if (
    /(?:amount|income|expense|balance|assets?|liabilit(?:y|ies)|savings?|investments?|debts?|cash|value|diff|change|avg|gain)$/.test(
      normalized,
    )
  ) {
    return "currency";
  }
  return undefined;
}

function addClaim(grounded: GroundedValues, value: unknown, unit: FinancialUnit | undefined): void {
  if (unit !== undefined && typeof value === "number" && Number.isFinite(value)) {
    grounded.claims.push({ value, unit });
  }
}

function collectGroundedValues(value: unknown, grounded: GroundedValues, key = ""): void {
  if (typeof value === "string") {
    grounded.strings.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectGroundedValues(entry, grounded, key);

    const amountRecords = value.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const amount = Reflect.get(entry, "amount") ?? Reflect.get(entry, "totalAmount");
      return typeof amount === "number" && Number.isFinite(amount)
        ? [{ amount, record: entry as GroundedRecord }]
        : [];
    });
    if (amountRecords.length > 0) {
      const total = amountRecords.reduce((sum, { amount }) => sum + amount, 0);
      grounded.claims.push({
        value: total,
        unit: "currency",
      });
      if (total !== 0) {
        for (const { amount, record } of amountRecords) {
          const category = record.category ?? record.name;
          if (typeof category === "string") {
            const percentage = (amount / total) * 100;
            grounded.claims.push({ value: percentage, unit: "percentage" });
            grounded.records.push({
              ...record,
              amount,
              category,
              percentage,
            });
          }
        }
      }
    }
    return;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as GroundedRecord;
    grounded.records.push(record);
    for (const [entryKey, entry] of Object.entries(record)) {
      collectGroundedValues(entry, grounded, entryKey);
    }

    const income = record.income ?? record.totalIncome;
    const expense = record.expense ?? record.totalExpense;
    if (typeof income === "number" && typeof expense === "number") {
      grounded.claims.push({ value: income - expense, unit: "currency" });
    }
    return;
  }

  addClaim(grounded, value, getFinancialUnit(key));
}

function isGroundedClaim(claim: FinancialClaim, sources: readonly FinancialClaim[]): boolean {
  return sources.some(
    (source) =>
      source.unit === claim.unit &&
      Math.abs(source.value - claim.value) < (claim.unit === "percentage" ? 0.5 : 0.01),
  );
}

function getCardClaims(cards: readonly FinanceChatCard[]): {
  claims: FinancialClaim[];
  strings: string[];
} {
  const claims: FinancialClaim[] = [];
  const strings: string[] = [];

  for (const card of cards) {
    if (card.type === "summary") {
      claims.push(
        ...card.metrics.map(({ amount }) => ({ value: amount, unit: "currency" as const })),
      );
    }
    if (card.type === "insight" && card.amount !== undefined) {
      claims.push({ value: card.amount, unit: "currency" });
    }
    if (card.type === "chart") {
      claims.push(
        ...card.data.flatMap(({ values }) =>
          values.map((value) => ({ value, unit: "currency" as const })),
        ),
      );
    }
    if (card.type === "categoryBreakdown") {
      for (const category of card.categories) {
        claims.push(
          { value: category.amount, unit: "currency" },
          { value: category.percentage, unit: "percentage" },
        );
        strings.push(category.name);
      }
    }
    if (card.type === "transactionList") {
      for (const transaction of card.transactions) {
        claims.push({ value: transaction.amount, unit: "currency" });
        strings.push(
          transaction.id,
          transaction.date,
          transaction.description,
          ...(transaction.category === undefined ? [] : [transaction.category]),
        );
      }
    }
  }

  return { claims, strings };
}

function extractFinancialClaims(text: string): FinancialClaim[] {
  const claims: FinancialClaim[] = [];
  const number = "-?\\d[\\d,]*(?:\\.\\d+)?";
  const pattern = new RegExp(
    `(?:¥\\s*(${number})\\s*(兆|億|万|千)?(?:\\s*円)?|(${number})\\s*(兆|億|万|千)?\\s*(円|%|％))`,
    "g",
  );
  const multipliers: Record<string, number> = {
    兆: 1_000_000_000_000,
    億: 100_000_000,
    万: 10_000,
    千: 1_000,
  };

  for (const match of text.matchAll(pattern)) {
    const value = Number((match[1] ?? match[3])?.replaceAll(",", ""));
    const multiplier = multipliers[match[2] ?? match[4] ?? ""] ?? 1;
    claims.push({
      value: value * multiplier,
      unit: match[5] === "%" || match[5] === "％" ? "percentage" : "currency",
    });
  }
  return claims;
}

function getCardProse(cards: readonly FinanceChatCard[]): string {
  return cards
    .flatMap((card) => {
      const prose = [card.title, "description" in card ? card.description : undefined];
      if (card.type === "summary") prose.push(...card.metrics.map(({ label }) => label));
      if (card.type === "insight") prose.push(card.amountLabel, card.action?.label);
      if (card.type === "action") prose.push(card.action.label);
      if (card.type === "empty") prose.push(...card.prompts);
      if (card.type === "categoryBreakdown") prose.push(...card.categories.map(({ name }) => name));
      if (card.type === "transactionList") {
        prose.push(
          ...card.transactions.flatMap(({ description, category }) => [description, category]),
        );
      }
      if (card.type === "chart") {
        prose.push(...card.series.map(({ name }) => name), ...card.data.map(({ label }) => label));
      }
      return prose;
    })
    .filter((value): value is string => value !== undefined)
    .join("\n");
}

function recordMatches(record: GroundedRecord, expected: GroundedRecord): boolean {
  return Object.entries(expected).every(([key, value]) => {
    const actual = record[key];
    if (typeof actual === "number" && typeof value === "number") {
      return Math.abs(actual - value) < (key === "percentage" ? 0.5 : 0.01);
    }
    return actual === value;
  });
}

function areCardRecordsGrounded(
  cards: readonly FinanceChatCard[],
  records: GroundedRecord[],
): boolean {
  for (const card of cards) {
    if (card.type === "transactionList") {
      for (const transaction of card.transactions) {
        const { amountType, ...fields } = transaction;
        if (!records.some((record) => recordMatches(record, { ...fields, type: amountType }))) {
          return false;
        }
      }
    }
    if (card.type === "categoryBreakdown") {
      for (const category of card.categories) {
        const expected = {
          category: category.name,
          amount: category.amount,
          percentage: category.percentage,
          type: category.amountType,
        };
        const alternate = { ...expected, totalAmount: expected.amount };
        delete (alternate as Partial<typeof alternate>).amount;
        if (
          !records.some(
            (record) => recordMatches(record, expected) || recordMatches(record, alternate),
          )
        ) {
          return false;
        }
      }
    }
  }
  return true;
}

function extractMarkdownHrefs(text: string): string[] {
  return [...text.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
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

  const grounded: GroundedValues = { claims: [], strings: new Set(), records: [] };
  for (const call of completedPriorDataCalls) {
    const result = priorToolResults.find(
      ({ toolCallId, toolName }) => toolCallId === call.toolCallId && toolName === call.toolName,
    );
    if (result) collectGroundedValues(result.output, grounded, call.toolName);
  }
  const cardClaims = getCardClaims(cards);
  const ungroundedCardClaims = cardClaims.claims.filter(
    (claim) => !isGroundedClaim(claim, grounded.claims),
  );
  const ungroundedCardStrings = cardClaims.strings.filter((claim) => !grounded.strings.has(claim));
  const ungroundedCardProse = extractFinancialClaims(getCardProse(cards)).filter(
    (claim) => !isGroundedClaim(claim, grounded.claims),
  );
  if (
    ungroundedCardClaims.length > 0 ||
    ungroundedCardStrings.length > 0 ||
    ungroundedCardProse.length > 0 ||
    !areCardRecordsGrounded(cards, grounded.records)
  ) {
    violations.push("カード内容に取得結果で根拠付けられない金融 claim が含まれる");
  }

  const finalTextSources = [...grounded.claims, ...cardClaims.claims];
  if (trace.text === undefined) {
    violations.push("最終回答テキストが評価 trace に含まれない");
  } else if (
    extractFinancialClaims(trace.text).some((claim) => !isGroundedClaim(claim, finalTextSources))
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
    const unverifiedTextHrefs = extractMarkdownHrefs(trace.text ?? "").filter(
      (href) => !navigationHrefs.has(href),
    );
    if (unverifiedTextHrefs.length > 0) {
      violations.push(`ナビゲーションツール未検証の本文リンク: ${unverifiedTextHrefs.join(", ")}`);
    }
  }

  return { passed: violations.length === 0, violations, toolNames, cardTypes };
}
