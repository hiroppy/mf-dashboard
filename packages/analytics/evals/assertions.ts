import { financeChatCardsSchema, type FinanceChatCard } from "../src/chat/cards";

interface AssertionContext {
  config?: {
    expectedCardTypes?: string[];
    expectedFacts?: Array<string | number>;
    expectedRoute?: string;
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

function normalize(value: string | number): string {
  return String(value)
    .normalize("NFKC")
    .replace(/[¥￥,\s]/g, "")
    .toLowerCase();
}

function collectFacts(value: unknown): Array<string | number> {
  if (typeof value === "string" || typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(collectFacts);
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      key === "href" || key === "action" || key === "type" ? [] : collectFacts(item),
    );
  }
  return [];
}

function includesFact(actualFacts: Array<string | number>, expected: string | number): boolean {
  if (typeof expected === "number") {
    return actualFacts.some((actual) => typeof actual === "number" && actual === expected);
  }
  return actualFacts.some(
    (actual) => typeof actual === "string" && normalize(actual).includes(normalize(expected)),
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
    cardTypesMismatch
      ? `card types 不一致: expected=${expectedTypes.join(",")} actual=${actualTypes.join(",")}`
      : undefined,
    routeMissing ? `不足 route: ${config.expectedRoute}` : undefined,
  ].filter(Boolean);

  return failures.length === 0
    ? { pass: true, score: 1, reason: "期待する最終応答です。" }
    : { pass: false, score: 0, reason: failures.join(" / ") };
}
