import { financeChatCardsSchema, type FinanceChatCard } from "../src/chat/cards";

interface MetricExpectation {
  label: string;
  amount: number;
  amountType: string;
}

interface TransactionExpectation {
  date: string;
  amount: number;
  amountType: string;
}

interface TransactionGroupExpectation {
  category: string;
  month: string;
  amountType: string;
}

interface AssertionContext {
  config?: {
    expectedCardTypes?: string[];
    expectedCategories?: MetricExpectation[];
    expectedFacts?: string[];
    expectedMetrics?: MetricExpectation[];
    expectedRoute?: string;
    expectedTransactionGroup?: TransactionGroupExpectation;
    expectedTransactions?: TransactionExpectation[];
    requiredInsightPatterns?: string[];
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

function collectRoutes(output: EvaluationOutput): string[] {
  const cardRoutes = output.cards.flatMap((card) => {
    const routes: string[] = [];
    if ("href" in card && card.href) routes.push(card.href);
    if ("action" in card && card.action) routes.push(card.action.href);
    return routes;
  });
  const textRoutes = Array.from(
    output.text.matchAll(/(?<!!)\[[^\]]+]\((\/[^)\s]+)\)/g),
    ([, route]) => String(route),
  );
  return [...cardRoutes, ...textRoutes];
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
  const expectedMetrics = config.expectedMetrics ?? [];
  const summaryMetricsMismatch =
    expectedMetrics.length > 0 &&
    (summaryMetrics.length !== expectedMetrics.length ||
      expectedMetrics.some(
        (expected) => !summaryMetrics.some((actual) => metricMatches(actual, expected)),
      ));
  const categoryRows = parsed.cards.flatMap((card) =>
    card.type === "categoryBreakdown"
      ? card.categories.map(({ name, amount, amountType }) => ({
          label: name,
          amount,
          amountType,
        }))
      : [],
  );
  const expectedCategories = config.expectedCategories ?? [];
  const categoriesMismatch =
    expectedCategories.length > 0 &&
    (categoryRows.length !== expectedCategories.length ||
      expectedCategories.some(
        (expected) => !categoryRows.some((actual) => metricMatches(actual, expected)),
      ));
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
            (actual) =>
              actual.date === expected.date &&
              actual.amount === expected.amount &&
              actual.amountType === expected.amountType,
          ),
      ));
  const expectedTransactionGroup = config.expectedTransactionGroup;
  const transactionGroupMismatch =
    expectedTransactionGroup !== undefined &&
    (transactionRows.length === 0 ||
      transactionRows.some(
        ({ date, category, amountType }) =>
          !date.startsWith(`${expectedTransactionGroup.month}-`) ||
          normalize(category ?? "") !== normalize(expectedTransactionGroup.category) ||
          amountType !== expectedTransactionGroup.amountType,
      ));
  const insightText = parsed.cards
    .filter((card) => card.type === "insight")
    .map(({ title, description }) => `${title}\n${description}`)
    .join("\n");
  const missingInsightPatterns = (config.requiredInsightPatterns ?? []).filter(
    (pattern) => !new RegExp(pattern, "u").test(insightText),
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
    missingFacts.length > 0 ? `不足 facts: ${missingFacts.join(", ")}` : undefined,
    summaryMetricsMismatch
      ? `summary metrics 不一致: expected=${expectedMetrics.map(({ label, amount }) => `${label}=${amount}`).join(",")}`
      : undefined,
    categoriesMismatch
      ? `categories 不一致: expected=${expectedCategories.map(({ label, amount }) => `${label}=${amount}`).join(",")}`
      : undefined,
    transactionsMismatch
      ? `transactions 不一致: expected=${expectedTransactions.map(({ date, amount, amountType }) => `${date}=${amount}/${amountType}`).join(",")}`
      : undefined,
    transactionGroupMismatch
      ? `transaction group 不一致: ${expectedTransactionGroup?.month}/${expectedTransactionGroup?.category}/${expectedTransactionGroup?.amountType}`
      : undefined,
    missingInsightPatterns.length > 0
      ? `不足 insight patterns: ${missingInsightPatterns.join(", ")}`
      : undefined,
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
