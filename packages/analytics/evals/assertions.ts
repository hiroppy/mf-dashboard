import { financeChatCardsSchema, type FinanceChatCard } from "../src/chat/cards";

interface MetricExpectation {
  label: string;
  amount: number;
  amountType: string;
}

interface CategoryExpectation extends MetricExpectation {
  percentage: number;
}

interface VisibleAmountClaim {
  label: string;
  amount: number;
  rolePattern?: string;
}

interface InsightMetricAllowance {
  amount: number;
  amountType: string;
  labelPattern: string;
}

interface TransactionExpectation {
  ids: string[];
  date: string;
  description: string;
  amount: number;
  amountType: string;
  category?: string;
}

interface TransactionGroupExpectation {
  category: string;
  month: string;
  amountType: string;
  allowedTransactions: TransactionExpectation[];
}

interface AssertionContext {
  config?: {
    allowedVisibleAmounts?: number[];
    expectedCardFacts?: string[];
    expectedCardTypes?: string[];
    expectedCategories?: CategoryExpectation[];
    expectedInsightActionPattern?: string;
    expectedInsightFacts?: string[];
    allowedInsightMetrics?: InsightMetricAllowance[];
    expectedMetrics?: MetricExpectation[];
    expectedRoute?: string;
    expectedTransactionGroup?: TransactionGroupExpectation;
    expectedTransactions?: TransactionExpectation[];
    requiredInsightPatterns?: string[];
    visibleAmountClaims?: VisibleAmountClaim[];
  };
}

interface EvaluationOutput {
  text: string;
  cards: FinanceChatCard[];
}

type TransactionRow = Extract<FinanceChatCard, { type: "transactionList" }>["transactions"][number];

function parseOutput(output: string): EvaluationOutput | undefined {
  try {
    const value = JSON.parse(output) as Partial<EvaluationOutput>;
    const cards = financeChatCardsSchema.safeParse(value.cards);
    if (typeof value.text !== "string" || !cards.success) return undefined;
    return { text: value.text, cards: cards.data };
  } catch {
    return undefined;
  }
}

function normalize(value: string): string {
  return String(value)
    .normalize("NFKC")
    .replace(/[¥￥,\s]/g, "")
    .toLowerCase();
}

function collectFacts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectFacts);
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      key === "href" || key === "type" ? [] : collectFacts(item),
    );
  }
  return [];
}

function includesFact(actualFacts: string[], expected: string): boolean {
  return actualFacts.some((actual) => normalize(actual).includes(normalize(expected)));
}

function metricMatches(actual: MetricExpectation, expected: MetricExpectation): boolean {
  return (
    normalize(actual.label) === normalize(expected.label) &&
    actual.amount === expected.amount &&
    actual.amountType === expected.amountType
  );
}

function multisetsMatch<Actual, Expected>(
  actualItems: Actual[],
  expectedItems: Expected[],
  matches: (actual: Actual, expected: Expected) => boolean,
): boolean {
  if (actualItems.length !== expectedItems.length) return false;
  const remainingItems = [...actualItems];
  for (const expected of expectedItems) {
    const matchingIndex = remainingItems.findIndex((actual) => matches(actual, expected));
    if (matchingIndex === -1) return false;
    remainingItems.splice(matchingIndex, 1);
  }
  return true;
}

function transactionMatches(actual: TransactionRow, expected: TransactionExpectation): boolean {
  return (
    expected.ids.includes(actual.id) &&
    actual.date === expected.date &&
    normalize(actual.description) === normalize(expected.description) &&
    actual.amount === expected.amount &&
    actual.amountType === expected.amountType &&
    normalize(actual.category ?? "") === normalize(expected.category ?? "")
  );
}

function transactionsMatchExactly(
  actualRows: TransactionRow[],
  expectedRows: TransactionExpectation[],
): boolean {
  return multisetsMatch(actualRows, expectedRows, transactionMatches);
}

function transactionsAreAllowedSubset(
  actualRows: TransactionRow[],
  allowedRows: TransactionExpectation[],
): boolean {
  const remainingAllowedRows = [...allowedRows];
  for (const actual of actualRows) {
    const matchingIndex = remainingAllowedRows.findIndex((expected) =>
      transactionMatches(actual, expected),
    );
    if (matchingIndex === -1) return false;
    remainingAllowedRows.splice(matchingIndex, 1);
  }
  return true;
}

function collectRoutes(output: EvaluationOutput): string[] {
  const cardRoutes = output.cards.flatMap((card) => {
    const routes: string[] = [];
    if ("href" in card && card.href) routes.push(card.href);
    if ("action" in card && card.action) routes.push(card.action.href);
    return routes;
  });
  const textRoutes = Array.from(
    output.text.matchAll(/(?<![\w:/])\/[A-Za-z0-9%._~!$&'*+,;=:@/?#-]+/g),
    ([route]) => route,
  );
  return [...new Set([...cardRoutes, ...textRoutes])];
}

function collectVisibleAmounts(output: EvaluationOutput): number[] {
  return collectVisibleAmountMatches(output).map(({ amount }) => amount);
}

function collectVisibleAmountMatches(output: EvaluationOutput) {
  const visibleTexts = [output.text, ...collectFacts(output.cards)];
  return visibleTexts.flatMap((text) =>
    Array.from(
      text.matchAll(/(?:[¥￥]\s*([\d,.]+)|((?:[\d,.]+\s*(?:億|万|千)\s*)+[\d,.]*|[\d,.]+)\s*円)/g),
      (match) => ({
        amount: parseVisibleAmount(match[1], match[2]),
        index: match.index,
        text,
      }),
    ),
  );
}

function parseVisibleAmount(prefixedAmount?: string, japaneseAmount?: string): number {
  if (prefixedAmount !== undefined) return Number(prefixedAmount.replaceAll(",", ""));
  let total = 0;
  const withoutUnits = (japaneseAmount ?? "").replace(
    /([\d,.]+)\s*(億|万|千)/g,
    (_, value: string, unit: "億" | "万" | "千") => {
      total += Number(value.replaceAll(",", "")) * { 億: 100_000_000, 万: 10_000, 千: 1000 }[unit];
      return "";
    },
  );
  const remainder = withoutUnits.trim();
  return total + (remainder === "" ? 0 : Number(remainder.replaceAll(",", "")));
}

function collectMislabeledVisibleAmounts(
  output: EvaluationOutput,
  expectedClaims: VisibleAmountClaim[],
): string[] {
  return collectVisibleAmountMatches(output).flatMap(({ amount, index, text }) => {
    const nearbyClaims = expectedClaims
      .map((claim) => {
        const { label } = claim;
        const beforeIndex = text.lastIndexOf(label, index);
        const afterIndex = text.indexOf(label, index);
        const distance = Math.min(
          beforeIndex === -1 ? Number.POSITIVE_INFINITY : index - beforeIndex,
          afterIndex === -1 ? Number.POSITIVE_INFINITY : afterIndex - index,
        );
        return { claim, distance };
      })
      .filter(({ distance }) => distance <= 20)
      .sort((left, right) => left.distance - right.distance);
    const nearestLabel = nearbyClaims[0]?.claim.label;
    if (nearestLabel === undefined) return [];
    const claimsForLabel = nearbyClaims
      .filter(({ claim }) => claim.label === nearestLabel)
      .map(({ claim }) => claim);
    const context = text.slice(Math.max(0, index - 30), index + 30);
    const roleSpecificClaims = claimsForLabel.filter(
      ({ rolePattern }) => rolePattern !== undefined && new RegExp(rolePattern, "u").test(context),
    );
    const applicableClaims =
      roleSpecificClaims.length > 0
        ? roleSpecificClaims
        : claimsForLabel.filter(({ rolePattern }) => rolePattern === undefined);
    if (
      applicableClaims.length === 0 ||
      applicableClaims.some((claim) => claim.amount === amount)
    ) {
      return [];
    }
    return [`${nearestLabel}=${amount}`];
  });
}

export default function assertFinanceResponse(output: string, context: AssertionContext = {}) {
  const parsed = parseOutput(output);
  if (!parsed) return { pass: false, score: 0, reason: "text/cards の評価 JSON が不正です。" };

  const config = context.config ?? {};
  const unexpectedVisibleAmounts = collectVisibleAmounts(parsed).filter(
    (amount) => !(config.allowedVisibleAmounts ?? []).includes(amount),
  );
  const mislabeledVisibleAmounts = collectMislabeledVisibleAmounts(
    parsed,
    config.visibleAmountClaims ?? [],
  );
  const cardFacts = collectFacts(parsed.cards);
  const missingCardFacts = (config.expectedCardFacts ?? []).filter(
    (expected) => !includesFact(cardFacts, expected),
  );
  const summaryMetrics = parsed.cards.flatMap((card) =>
    card.type === "summary" ? card.metrics : [],
  );
  const expectedMetrics = config.expectedMetrics ?? [];
  const summaryMetricsMismatch =
    expectedMetrics.length > 0 && !multisetsMatch(summaryMetrics, expectedMetrics, metricMatches);
  const categoryRows = parsed.cards.flatMap((card) =>
    card.type === "categoryBreakdown"
      ? card.categories.map(({ name, amount, amountType, percentage }) => ({
          label: name,
          amount,
          amountType,
          percentage,
        }))
      : [],
  );
  const expectedCategories = config.expectedCategories ?? [];
  const categoriesMismatch =
    expectedCategories.length > 0 &&
    !multisetsMatch(
      categoryRows,
      expectedCategories,
      (actual, expected) =>
        metricMatches(actual, expected) &&
        Math.abs(actual.percentage - expected.percentage) <= 0.01,
    );
  const transactionRows = parsed.cards.flatMap((card) =>
    card.type === "transactionList" ? card.transactions : [],
  );
  const expectedTransactions = config.expectedTransactions ?? [];
  const transactionsMismatch =
    expectedTransactions.length > 0 &&
    !transactionsMatchExactly(transactionRows, expectedTransactions);
  const expectedTransactionGroup = config.expectedTransactionGroup;
  const transactionGroupMismatch =
    expectedTransactionGroup !== undefined &&
    (transactionRows.length === 0 ||
      transactionRows.some(
        (transaction) =>
          !transaction.date.startsWith(`${expectedTransactionGroup.month}-`) ||
          normalize(transaction.category ?? "") !== normalize(expectedTransactionGroup.category) ||
          transaction.amountType !== expectedTransactionGroup.amountType,
      ) ||
      !transactionsAreAllowedSubset(transactionRows, expectedTransactionGroup.allowedTransactions));
  const insightCards = parsed.cards.filter((card) => card.type === "insight");
  const insightDescription = insightCards.map(({ description }) => description).join("\n");
  const missingInsightFacts = (config.expectedInsightFacts ?? []).filter(
    (expected) => !includesFact([insightDescription], expected),
  );
  const missingInsightPatterns = (config.requiredInsightPatterns ?? []).filter(
    (pattern) => !new RegExp(pattern, "u").test(insightDescription),
  );
  const insightMetrics = insightCards.flatMap((card) =>
    card.amount === undefined || card.amountLabel === undefined || card.amountType === undefined
      ? []
      : [{ label: card.amountLabel, amount: card.amount, amountType: card.amountType }],
  );
  const allowedInsightMetrics = config.allowedInsightMetrics;
  const insightMetricsMismatch =
    allowedInsightMetrics !== undefined &&
    insightMetrics.some(
      (actual) =>
        !allowedInsightMetrics.some(
          (allowed) =>
            actual.amount === allowed.amount &&
            actual.amountType === allowed.amountType &&
            new RegExp(allowed.labelPattern, "u").test(actual.label),
        ),
    );
  const expectedInsightActionPattern = config.expectedInsightActionPattern;
  const insightActionMismatch =
    expectedInsightActionPattern !== undefined &&
    insightCards.some(
      (card) =>
        card.action === undefined ||
        !new RegExp(expectedInsightActionPattern, "u").test(card.action.label),
    );
  const actualTypes = parsed.cards.map(({ type }) => type);
  const expectedTypes = config.expectedCardTypes ?? [];
  const cardTypesMismatch =
    expectedTypes.length > 0 &&
    (actualTypes.length !== expectedTypes.length ||
      actualTypes.some((actual, index) => actual !== expectedTypes[index]));
  const actualRoutes = collectRoutes(parsed);
  const routeMismatch =
    config.expectedRoute &&
    (actualRoutes.length === 0 || actualRoutes.some((route) => route !== config.expectedRoute));

  const failures = [
    unexpectedVisibleAmounts.length > 0
      ? `未許可の可視金額: ${[...new Set(unexpectedVisibleAmounts)].join(",")}`
      : undefined,
    mislabeledVisibleAmounts.length > 0
      ? `誤ラベルの可視金額: ${[...new Set(mislabeledVisibleAmounts)].join(",")}`
      : undefined,
    missingCardFacts.length > 0 ? `不足 card facts: ${missingCardFacts.join(", ")}` : undefined,
    summaryMetricsMismatch
      ? `summary metrics 不一致: expected=${expectedMetrics.map(({ label, amount }) => `${label}=${amount}`).join(",")}`
      : undefined,
    categoriesMismatch
      ? `categories 不一致: expected=${expectedCategories.map(({ label, amount, percentage }) => `${label}=${amount}/${percentage}%`).join(",")}`
      : undefined,
    transactionsMismatch ? "transactions 不一致" : undefined,
    transactionGroupMismatch
      ? `transaction group 不一致: ${expectedTransactionGroup?.month}/${expectedTransactionGroup?.category}/${expectedTransactionGroup?.amountType}`
      : undefined,
    missingInsightPatterns.length > 0
      ? `不足 insight patterns: ${missingInsightPatterns.join(", ")}`
      : undefined,
    missingInsightFacts.length > 0
      ? `不足 insight facts: ${missingInsightFacts.join(", ")}`
      : undefined,
    insightMetricsMismatch ? "insight metrics 不一致" : undefined,
    insightActionMismatch ? `insight action 不一致: ${expectedInsightActionPattern}` : undefined,
    cardTypesMismatch
      ? `card types 不一致: expected=${expectedTypes.join(",")} actual=${actualTypes.join(",")}`
      : undefined,
    routeMismatch
      ? `route 不一致: expected=${config.expectedRoute} actual=${actualRoutes.join(",") || "none"}`
      : undefined,
  ].filter(Boolean);

  return failures.length === 0
    ? { pass: true, score: 1, reason: "期待する最終応答です。" }
    : { pass: false, score: 0, reason: failures.join(" / ") };
}
