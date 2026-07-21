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
  cards: unknown[];
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
    if (typeof value.text !== "string" || !Array.isArray(value.cards)) {
      return undefined;
    }
    return value as EvaluationOutput;
  } catch {
    return undefined;
  }
}

export default function assertFinanceChatOutput(output: string, context: AssertionContext = {}) {
  const result = parseOutput(output);
  if (!result)
    return { pass: false, score: 0, reason: "provider output が期待する JSON 形式ではありません" };

  const config = context.config ?? {};
  const visibleOutput = normalize(JSON.stringify({ text: result.text, cards: result.cards }));
  const cardTypes = result.cards.flatMap((card) =>
    typeof card === "object" && card !== null && "type" in card && typeof card.type === "string"
      ? [card.type]
      : [],
  );
  const missingFacts = (config.expectedFacts ?? []).filter(
    (fact) => !visibleOutput.includes(normalize(fact)),
  );
  const hasExpectedAlternative = (config.expectedAnyFacts ?? []).some((fact) =>
    visibleOutput.includes(normalize(fact)),
  );
  const missingCardTypes = (config.expectedCardTypes ?? []).filter(
    (type) => !cardTypes.includes(type),
  );
  const forbiddenPhrases = (config.forbiddenPhrases ?? []).filter((phrase) =>
    visibleOutput.includes(normalize(phrase)),
  );
  const missingRoute =
    config.expectedRoute && !visibleOutput.includes(normalize(config.expectedRoute))
      ? config.expectedRoute
      : undefined;

  const failures = [
    missingFacts.length > 0 ? `期待 facts 不足: ${missingFacts.join(", ")}` : undefined,
    config.expectedAnyFacts?.length && !hasExpectedAlternative
      ? `期待候補 facts 不足: ${config.expectedAnyFacts.join(", ")}`
      : undefined,
    missingCardTypes.length > 0 ? `期待 card 不足: ${missingCardTypes.join(", ")}` : undefined,
    forbiddenPhrases.length > 0 ? `禁止表現: ${forbiddenPhrases.join(", ")}` : undefined,
    missingRoute ? `期待 route 不足: ${missingRoute}` : undefined,
    result.text.trim() === "" && result.cards.length === 0 ? "最終回答が空です" : undefined,
  ].filter((failure): failure is string => failure !== undefined);

  return failures.length === 0
    ? { pass: true, score: 1, reason: "期待値と一致しました" }
    : { pass: false, score: 0, reason: failures.join(" / ") };
}
