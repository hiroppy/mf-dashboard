import { financeChatCardsSchema, type FinanceChatCard } from "../src/chat/cards";

interface MetricExpectation {
  label: string;
  amount: number;
  amountType: string;
}

interface AssertionContext {
  config?: {
    expectedCardTypes?: string[];
    expectedMetrics?: MetricExpectation[];
    expectedRoutes?: string[];
  };
}

interface EvaluationOutput {
  text: string;
  cards: FinanceChatCard[];
  routes: string[];
}

interface AssertionResult {
  pass: boolean;
  score: number;
  reason: string;
}

function fail(reason: string): AssertionResult {
  return { pass: false, score: 0, reason };
}

function parseOutput(output: string): EvaluationOutput | undefined {
  try {
    const value = JSON.parse(output) as Partial<EvaluationOutput>;
    const cards = financeChatCardsSchema.safeParse(value.cards);
    if (
      typeof value.text !== "string" ||
      !cards.success ||
      !Array.isArray(value.routes) ||
      !value.routes.every((route) => typeof route === "string")
    ) {
      return undefined;
    }
    return { text: value.text, cards: cards.data, routes: value.routes };
  } catch {
    return undefined;
  }
}

function collectMetrics(cards: FinanceChatCard[]): MetricExpectation[] {
  return cards.flatMap((card) => {
    if (card.type === "summary") return card.metrics;
    if (card.type === "insight" && card.amount !== undefined) {
      return [
        {
          label: card.amountLabel!,
          amount: card.amount,
          amountType: card.amountType!,
        },
      ];
    }
    return [];
  });
}

export default function assertFinanceChatOutput(
  output: string,
  context: AssertionContext,
): AssertionResult {
  const actual = parseOutput(output);
  if (!actual) return fail("出力が finance chat の評価JSON形式ではありません。");

  const config = context.config ?? {};
  const actualTypes = new Set<string>(actual.cards.map((card) => card.type));
  const missingTypes = (config.expectedCardTypes ?? []).filter((type) => !actualTypes.has(type));
  if (missingTypes.length > 0) {
    return fail(`期待するカードがありません: ${missingTypes.join(", ")}`);
  }

  const actualRoutes = new Set(actual.routes);
  const missingRoutes = (config.expectedRoutes ?? []).filter((route) => !actualRoutes.has(route));
  if (missingRoutes.length > 0) {
    return fail(`期待する導線がありません: ${missingRoutes.join(", ")}`);
  }

  const actualMetrics = collectMetrics(actual.cards);
  const missingMetrics = (config.expectedMetrics ?? []).filter(
    (expected) =>
      !actualMetrics.some(
        (metric) =>
          metric.label.includes(expected.label) &&
          metric.amount === expected.amount &&
          metric.amountType === expected.amountType,
      ),
  );
  if (missingMetrics.length > 0) {
    return fail(`期待する数値カードがありません: ${JSON.stringify(missingMetrics)}`);
  }

  return { pass: true, score: 1, reason: "期待する cards・metrics・routes を確認しました。" };
}
