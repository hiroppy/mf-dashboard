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

function completesStrategyInSingleStep(
  strategy: readonly FinanceChatToolExpectation[],
  steps: readonly FinanceChatEvaluationStep[],
): boolean {
  return steps.some((step) => {
    const dataCalls = step.toolCalls.filter(({ toolName }) => isDataTool(toolName));
    const completedDataCalls = dataCalls.filter((call) =>
      hasMatchingResult(call, step.toolResults),
    );
    return matchesStrategy(strategy, dataCalls, completedDataCalls);
  });
}

function isDataTool(toolName: string): boolean {
  return toolName !== NAVIGATION_TOOL && toolName !== PRESENTATION_TOOL;
}

type FinancialUnit = "currency" | "percentage";
type AmountType = "income" | "expense" | "balance";

interface FinancialClaim {
  value: number;
  unit: FinancialUnit;
  amountType?: AmountType;
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

function getAmountType(key: string, record?: GroundedRecord): AmountType | undefined {
  const recordType = record?.type;
  if (recordType === "income" || recordType === "expense") return recordType;

  const normalized = key.toLowerCase();
  if (normalized.includes("netincome")) return "balance";
  if (normalized.includes("income")) return "income";
  if (normalized.includes("expense")) return "expense";
  return getFinancialUnit(key) === "currency" ? "balance" : undefined;
}

function addClaim(
  grounded: GroundedValues,
  value: unknown,
  unit: FinancialUnit | undefined,
  amountType?: AmountType,
): void {
  if (unit !== undefined && typeof value === "number" && Number.isFinite(value)) {
    grounded.claims.push({ value, unit, amountType });
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
    const recordsByType = Map.groupBy(amountRecords, ({ record }) =>
      getAmountType("amount", record),
    );
    const supportsAmountTotals = key === "getMonthlyCategoryTotals" || key === "searchTransactions";
    for (const [amountType, typedRecords] of recordsByType) {
      const total = typedRecords.reduce((sum, { amount }) => sum + amount, 0);
      if (supportsAmountTotals) {
        grounded.claims.push({ value: total, unit: "currency", amountType });
      }
      if (key === "getMonthlyCategoryTotals" && total !== 0 && amountType !== undefined) {
        for (const { amount, record } of typedRecords) {
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
      if (typeof entry === "number") {
        if (entryKey === "id" || entryKey === "mfId") grounded.strings.add(String(entry));
        const isCategoryMap = key === "byCategory";
        addClaim(
          grounded,
          entry,
          isCategoryMap ? "currency" : getFinancialUnit(entryKey),
          isCategoryMap ? "expense" : getAmountType(entryKey, record),
        );
        if (isCategoryMap) {
          grounded.claims.push({ value: entry, unit: "currency", amountType: "balance" });
          grounded.records.push({ category: entryKey, amount: entry, type: "expense" });
        }
      } else {
        collectGroundedValues(entry, grounded, entryKey);
      }
    }

    const income = record.income ?? record.totalIncome;
    const expense = record.expense ?? record.totalExpense;
    if (typeof income === "number" && typeof expense === "number") {
      grounded.claims.push({ value: income - expense, unit: "currency", amountType: "balance" });
    }
    return;
  }

  addClaim(grounded, value, getFinancialUnit(key), getAmountType(key));
}

function isGroundedClaim(claim: FinancialClaim, sources: readonly FinancialClaim[]): boolean {
  return sources.some(
    (source) =>
      source.unit === claim.unit &&
      (claim.amountType === undefined || source.amountType === claim.amountType) &&
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
        ...card.metrics.map(({ amount, amountType }) => ({
          value: amount,
          unit: "currency" as const,
          amountType,
        })),
      );
    }
    if (card.type === "insight" && card.amount !== undefined) {
      claims.push({ value: card.amount, unit: "currency", amountType: card.amountType });
    }
    if (card.type === "chart") {
      claims.push(
        ...card.data.flatMap(({ values }) =>
          values.map((value, index) => ({
            value,
            unit: "currency" as const,
            amountType: card.series[index]?.amountType,
          })),
        ),
      );
    }
    if (card.type === "categoryBreakdown") {
      for (const category of card.categories) {
        claims.push(
          { value: category.amount, unit: "currency", amountType: category.amountType },
          { value: category.percentage, unit: "percentage" },
        );
        strings.push(category.name);
      }
    }
    if (card.type === "transactionList") {
      for (const transaction of card.transactions) {
        claims.push({
          value: transaction.amount,
          unit: "currency",
          amountType: transaction.amountType,
        });
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

function parseJapaneseCurrency(expression: string): number {
  const negative = expression.trimStart().startsWith("-");
  const unsigned = expression.replace(/^\s*-/, "");
  const multipliers: Record<string, number> = {
    兆: 1_000_000_000_000,
    億: 100_000_000,
    万: 10_000,
    千: 1_000,
  };
  let value = 0;
  for (const component of unsigned.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(兆|億|万|千)?/g)) {
    value += Number(component[1]?.replaceAll(",", "")) * (multipliers[component[2] ?? ""] ?? 1);
  }
  return negative ? -value : value;
}

function getClaimContext(text: string, claimIndex: number): string {
  const preceding = text.slice(0, claimIndex);
  const boundary = Math.max(
    preceding.lastIndexOf("。"),
    preceding.lastIndexOf("、"),
    preceding.lastIndexOf(","),
    preceding.lastIndexOf("\n"),
  );
  return preceding.slice(Math.max(boundary + 1, claimIndex - 24));
}

function extractFinancialClaims(text: string): FinancialClaim[] {
  const claims: FinancialClaim[] = [];
  const number = "-?\\d[\\d,]*(?:\\.\\d+)?";
  const currency = `(?:${number}\\s*(?:兆|億|万|千)\\s*)*${number}\\s*(?:兆|億|万|千)?`;
  const pattern = new RegExp(
    `(?:¥\\s*(${currency})(?:\\s*円)?|(${currency})\\s*円|(${number})\\s*(%|％))`,
    "g",
  );

  for (const match of text.matchAll(pattern)) {
    const percentage = match[3];
    claims.push(
      percentage === undefined
        ? {
            value: parseJapaneseCurrency(match[1] ?? match[2] ?? ""),
            unit: "currency",
            amountType: getLabelAmountType(getClaimContext(text, match.index ?? 0)),
          }
        : { value: Number(percentage.replaceAll(",", "")), unit: "percentage" },
    );
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

function getLabelAmountType(label: string): AmountType | undefined {
  if (/(?:収入|所得|入金)/.test(label)) return "income";
  if (/(?:支出|費用|出金)/.test(label)) return "expense";
  if (/(?:収支|資産|残高|貯蓄|手残り|負債)/.test(label)) return "balance";
  return undefined;
}

function areCardLabelsConsistent(cards: readonly FinanceChatCard[]): boolean {
  return cards.every((card) => {
    if (card.type === "summary") {
      return card.metrics.every(({ label, amountType }) => {
        const labelType = getLabelAmountType(label);
        return labelType === undefined || labelType === amountType;
      });
    }
    if (card.type === "insight" && card.amountLabel !== undefined) {
      const labelType = getLabelAmountType(card.amountLabel);
      return labelType === undefined || labelType === card.amountType;
    }
    if (card.type === "chart") {
      return card.series.every(({ name, amountType }) => {
        const labelType = getLabelAmountType(name);
        return labelType === undefined || labelType === amountType;
      });
    }
    return true;
  });
}

function hasActionableInsight(
  evaluationCase: FinanceChatEvaluationCase,
  cards: readonly FinanceChatCard[],
  records: readonly GroundedRecord[],
): boolean {
  if (!evaluationCase.requireActionableInsight) return true;

  const description = cards
    .filter((card) => card.type === "insight")
    .map(({ description }) => description)
    .join("\n");
  const categories = records.flatMap((record) => {
    const category = record.category ?? record.name;
    return typeof category === "string" ? [category] : [];
  });
  const hasPeriod = /(?:\d{4}年|\d{1,2}月|今月|先月|前月|過去|直近|期間)/.test(description);
  const hasCategory = categories.some((category) => description.includes(category));
  const hasComparison = /(?:前月|前年|平均|比較|通常|普段|前回|増加|減少|多い|少ない)/.test(
    description,
  );
  const hasReason = /(?:ため|ので|理由|要因|異常|変動|高い|低い)/.test(description);
  const citedCategoryAmounts = records.flatMap((record) => {
    const category = record.category ?? record.name;
    const amount = record.amount ?? record.totalAmount;
    return typeof category === "string" &&
      description.includes(category) &&
      typeof amount === "number"
      ? [amount]
      : [];
  });
  const amountTotal = citedCategoryAmounts.reduce((sum, amount) => sum + amount, 0);
  const insightAmounts = cards.flatMap((card) =>
    card.type === "insight" && card.amount !== undefined
      ? [{ amount: card.amount, amountType: card.amountType }]
      : [],
  );
  const hasGroundedAmounts = insightAmounts.every(
    ({ amount, amountType }) =>
      amountType === "balance" && (citedCategoryAmounts.includes(amount) || amount === amountTotal),
  );
  return hasPeriod && hasCategory && hasComparison && hasReason && hasGroundedAmounts;
}

function areCardRecordsGrounded(
  cards: readonly FinanceChatCard[],
  records: GroundedRecord[],
): boolean {
  for (const card of cards) {
    if (card.type === "transactionList") {
      for (const transaction of card.transactions) {
        const { id, amountType, ...fields } = transaction;
        if (
          !records.some((record) => {
            const sourceId = record.mfId ?? record.id;
            return (
              (typeof sourceId === "string" || typeof sourceId === "number") &&
              String(sourceId) === id &&
              recordMatches(record, { ...fields, type: amountType })
            );
          })
        ) {
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
  if (
    evaluationCase.requireParallelDataTools &&
    !evaluationCase.toolStrategies.some((strategy) =>
      completesStrategyInSingleStep(strategy, priorSteps),
    )
  ) {
    violations.push("独立したデータツールが同一ステップで完了していない");
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
    !areCardLabelsConsistent(cards) ||
    !hasActionableInsight(evaluationCase, cards, grounded.records) ||
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
