import { financeChatCardsSchema, type FinanceChatCard } from "../src/chat/cards";

interface MetricExpectation {
  label: string;
  amount: number;
  amountType: string;
}

interface TransactionExpectation {
  date: string;
  amount: number;
}

interface AssertionContext {
  config?: {
    expectedCardTypes?: string[];
    expectedCategories?: MetricExpectation[];
    expectedFacts?: string[];
    expectedMetrics?: MetricExpectation[];
    expectedRoute?: string;
    expectedTransactions?: TransactionExpectation[];
  };
}

interface EvaluationOutput {
  text: string;
  cards: FinanceChatCard[];
}

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
      key === "href" || key === "action" || key === "type" ? [] : collectFacts(item),
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

function collectRoutes(cards: FinanceChatCard[]): string[] {
  return cards.flatMap((card) => {
    const routes: string[] = [];
    if ("href" in card && card.href) routes.push(card.href);
    if ("action" in card && card.action) routes.push(card.action.href);
    return routes;
  });
}

export default function assertFinanceResponse(output: string, context: AssertionContext = {}) {
  const parsed = parseOutput(output);
  if (!parsed) return { pass: false, score: 0, reason: "text/cards の評価 JSON が不正です。" };

  const config = context.config ?? {};
  const facts = collectFacts(parsed);
  const missingFacts = (config.expectedFacts ?? []).filter(
    (expected) => !includesFact(facts, expected),
  );
  const summaryMetrics = parsed.cards.flatMap((card) =>
    card.type === "summary" ? card.metrics : [],
  );
  const missingMetrics = (config.expectedMetrics ?? []).filter(
    (expected) => !summaryMetrics.some((actual) => metricMatches(actual, expected)),
  );
  const categoryRows = parsed.cards.flatMap((card) =>
    card.type === "categoryBreakdown"
      ? card.categories.map(({ name, amount, amountType }) => ({
          label: name,
          amount,
          amountType,
        }))
      : [],
  );
  const missingCategories = (config.expectedCategories ?? []).filter(
    (expected) => !categoryRows.some((actual) => metricMatches(actual, expected)),
  );
  const transactionRows = parsed.cards.flatMap((card) =>
    card.type === "transactionList" ? card.transactions : [],
  );
  const expectedTransactions = config.expectedTransactions ?? [];
  const transactionsMismatch =
    expectedTransactions.length > 0 &&
    (transactionRows.length !== expectedTransactions.length ||
      expectedTransactions.some(
        (expected) =>
          !transactionRows.some(
            (actual) => actual.date === expected.date && actual.amount === expected.amount,
          ),
      ));
  const actualTypes = parsed.cards.map(({ type }) => type);
  const expectedTypes = config.expectedCardTypes ?? [];
  const cardTypesMismatch =
    expectedTypes.length > 0 &&
    (actualTypes.length !== expectedTypes.length ||
      actualTypes.some((actual, index) => actual !== expectedTypes[index]));
  const routeMissing =
    config.expectedRoute && !collectRoutes(parsed.cards).includes(config.expectedRoute);

  const failures = [
    missingFacts.length > 0 ? `不足 facts: ${missingFacts.join(", ")}` : undefined,
    missingMetrics.length > 0
      ? `不足 summary metrics: ${missingMetrics.map(({ label, amount }) => `${label}=${amount}`).join(", ")}`
      : undefined,
    missingCategories.length > 0
      ? `不足 categories: ${missingCategories.map(({ label, amount }) => `${label}=${amount}`).join(", ")}`
      : undefined,
    transactionsMismatch
      ? `transactions 不一致: expected=${expectedTransactions.map(({ date, amount }) => `${date}=${amount}`).join(",")}`
      : undefined,
    cardTypesMismatch
      ? `card types 不一致: expected=${expectedTypes.join(",")} actual=${actualTypes.join(",")}`
      : undefined,
    routeMissing ? `不足 route: ${config.expectedRoute}` : undefined,
  ].filter(Boolean);

  return failures.length === 0
    ? { pass: true, score: 1, reason: "期待する最終応答です。" }
    : { pass: false, score: 0, reason: failures.join(" / ") };
}
