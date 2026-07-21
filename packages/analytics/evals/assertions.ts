interface AssertionContext {
  config?: {
    expectedCardTypes?: string[];
    expectedAnyFacts?: Array<string | number>;
    expectedFacts?: Array<string | number>;
    expectedRoute?: string;
    forbiddenPhrases?: string[];
  };
}

interface EvaluationOutput {
  text: string;
  cards: FinanceChatCard[];
}

function normalize(value: unknown): string {
  return String(value)
    .normalize("NFKC")
    .replace(/[¥￥,\s]/g, "")
    .toLowerCase();
}

function parseOutput(output: string): EvaluationOutput | undefined {
  try {
    const value = JSON.parse(output) as Partial<EvaluationOutput>;
    const cards = financeChatCardsSchema.safeParse(value.cards);
    if (typeof value.text !== "string" || !cards.success) {
      return undefined;
    }
    return { text: value.text, cards: cards.data };
  } catch {
    return undefined;
  }
}

function collectFacts(value: unknown): Array<string | number> {
  if (typeof value === "string" || typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(collectFacts);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(collectFacts);
  }
  return [];
}

function matchesFact(facts: Array<string | number>, expected: string | number): boolean {
  if (typeof expected === "number") {
    return facts.some((fact) => typeof fact === "number" && fact === expected);
  }
  return facts.some(
    (fact) => typeof fact === "string" && normalize(fact).includes(normalize(expected)),
  );
}

function getRoutes(cards: FinanceChatCard[]): string[] {
  return cards.flatMap((card) => {
    const routes: string[] = [];
    if ("href" in card && card.href) routes.push(card.href);
    if ("action" in card && card.action) routes.push(card.action.href);
    return routes;
  });
}

export default function assertFinanceChatOutput(output: string, context: AssertionContext = {}) {
  const result = parseOutput(output);
  if (!result)
    return { pass: false, score: 0, reason: "provider output が期待する JSON 形式ではありません" };

  const config = context.config ?? {};
  const facts = collectFacts(result.cards);
  const cardTypes = result.cards.map(({ type }) => type);
  const missingFacts = (config.expectedFacts ?? []).filter((fact) => !matchesFact(facts, fact));
  const hasExpectedAlternative = (config.expectedAnyFacts ?? []).some((fact) =>
    matchesFact(facts, fact),
  );
  const expectedCardTypes = config.expectedCardTypes ?? [];
  const hasExpectedCardOrder =
    cardTypes.length === expectedCardTypes.length &&
    cardTypes.every((type, index) => type === expectedCardTypes[index]);
  const visibleOutput = normalize(JSON.stringify({ text: result.text, cards: result.cards }));
  const forbiddenPhrases = (config.forbiddenPhrases ?? []).filter((phrase) =>
    visibleOutput.includes(normalize(phrase)),
  );
  const missingRoute =
    config.expectedRoute &&
    !getRoutes(result.cards).some((route) => route.endsWith(config.expectedRoute!))
      ? config.expectedRoute
      : undefined;

  const failures = [
    missingFacts.length > 0 ? `期待 facts 不足: ${missingFacts.join(", ")}` : undefined,
    config.expectedAnyFacts?.length && !hasExpectedAlternative
      ? `期待候補 facts 不足: ${config.expectedAnyFacts.join(", ")}`
      : undefined,
    !hasExpectedCardOrder
      ? `card 順序不一致: ${cardTypes.join(", ")}（期待: ${expectedCardTypes.join(", ")}）`
      : undefined,
    forbiddenPhrases.length > 0 ? `禁止表現: ${forbiddenPhrases.join(", ")}` : undefined,
    missingRoute ? `期待 route 不足: ${missingRoute}` : undefined,
    result.text.trim() === "" && result.cards.length === 0 ? "最終回答が空です" : undefined,
  ].filter((failure): failure is string => failure !== undefined);

  return failures.length === 0
    ? { pass: true, score: 1, reason: "期待値と一致しました" }
    : { pass: false, score: 0, reason: failures.join(" / ") };
}
import { financeChatCardsSchema, type FinanceChatCard } from "../src/chat/cards";
