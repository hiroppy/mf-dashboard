import { financeChatCardsSchema, type FinanceChatCard } from "../src/chat/cards";

interface MetricExpectation {
  label: string;
  amount: number;
  amountType: string;
}

interface AssertionContext {
  config?: {
    expectedCardTypes?: string[];
    expectedAnyFacts?: Array<string | number>;
    expectedFacts?: Array<string | number>;
    expectedMetrics?: MetricExpectation[];
    allowedMetrics?: MetricExpectation[];
    expectedChartValues?: number[];
    expectedCategories?: Array<MetricExpectation & { percentage: number }>;
    expectedTransactions?: string[];
    expectedTransactionTotal?: number;
    expectedRoute?: string;
    expectedPeriods?: string[];
    requiredPatterns?: string[];
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
    if (typeof value.text !== "string" || !cards.success) return undefined;
    return { text: value.text, cards: cards.data };
  } catch {
    return undefined;
  }
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

function getMetrics(cards: FinanceChatCard[]): MetricExpectation[] {
  return cards.flatMap((card) => {
    if (card.type === "summary") return card.metrics;
    if (card.type === "insight" && card.amount !== undefined) {
      return [{ label: card.amountLabel!, amount: card.amount, amountType: card.amountType! }];
    }
    return [];
  });
}

function metricMatches(actual: MetricExpectation, expected: MetricExpectation): boolean {
  return (
    normalize(actual.label).includes(normalize(expected.label)) &&
    actual.amount === expected.amount &&
    actual.amountType === expected.amountType
  );
}

function parseCurrencyClaims(text: string) {
  const pattern =
    /(?:[¥￥]\s*(-?[\d,]+(?:\.\d+)?)\s*(兆|億|万)?|(-?[\d,]+(?:\.\d+)?)\s*(兆|億|万)?\s*円)/g;
  const scales = { 兆: 1e12, 億: 1e8, 万: 1e4 } as const;
  return [...text.matchAll(pattern)].map((match) => {
    const rawAmount = match[1] ?? match[3]!;
    const unit = (match[2] ?? match[4]) as keyof typeof scales | undefined;
    return {
      amount: Number(rawAmount.replaceAll(",", "")) * (unit ? scales[unit] : 1),
      index: match.index,
    };
  });
}

function getNearbyLabel(text: string, index: number): string | undefined {
  const start = Math.max(0, index - 18);
  const context = text.slice(start, index + 18);
  const claimPosition = index - start;
  return [...context.matchAll(/収入|支出|収支|差額|総資産|負債|借金|債務|食費/g)]
    .sort(
      (left, right) =>
        Math.abs((left.index ?? 0) - claimPosition) - Math.abs((right.index ?? 0) - claimPosition),
    )
    .at(0)?.[0];
}

function getAmountTypeForLabel(label: string): MetricExpectation["amountType"] {
  if (label.includes("収入")) return "income";
  if (/支出|食費/.test(label)) return "expense";
  return "balance";
}

function getUnsupportedPeriods(text: string, expectedPeriods: string[]): string[] {
  if (expectedPeriods.length === 0) return [];
  const claims = [
    ...[...text.matchAll(/20\d{2}-\d{2}-\d{2}/g)].map((match) => match[0]),
    ...[...text.matchAll(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/g)].map(
      (match) =>
        `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`,
    ),
    ...[...text.matchAll(/20\d{2}-(?:0[1-9]|1[0-2])(?!-\d{2})/g)].map((match) => match[0]),
    ...[...text.matchAll(/(20\d{2})年\s*(\d{1,2})月(?!\s*\d{1,2}日)/g)].map(
      (match) => `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`,
    ),
    ...[...text.matchAll(/(20\d{2})年(?!\s*\d{1,2}月)/g)].map((match) => match[1]!),
    ...[...text.matchAll(/(?<!年)(?<!\d)(\d{1,2})月(?!\s*\d{1,2}日)/g)].map((match) =>
      String(Number(match[1])),
    ),
  ];
  return claims.filter((claim) => {
    if (/^\d{1,2}$/.test(claim)) {
      return !expectedPeriods.some((period) => Number(period.slice(5, 7)) === Number(claim));
    }
    if (/^\d{4}-\d{2}$/.test(claim)) {
      return !expectedPeriods.some((period) => period.startsWith(claim));
    }
    if (/^\d{4}$/.test(claim)) {
      return !expectedPeriods.some((period) => period.startsWith(claim));
    }
    return !expectedPeriods.includes(claim);
  });
}

function getTextClaimFailures(
  text: string,
  cards: FinanceChatCard[],
  expectedPeriods: string[],
  comparisonAmounts: number[],
  location = "本文",
): string[] {
  const metrics = getMetrics(cards);
  const coordinatedAmounts = [
    ...text.matchAll(/(収入|支出)と(収入|支出)はそれぞれ[^\d]*(\d[\d,]*)円と(\d[\d,]*)円/g),
  ]
    .flatMap((match) => [
      { label: match[1]!, amount: Number(match[3]!.replaceAll(",", "")) },
      { label: match[2]!, amount: Number(match[4]!.replaceAll(",", "")) },
    ])
    .filter(({ label, amount }) =>
      metrics.some(
        (metric) =>
          metric.amount === amount &&
          metric.amountType === getAmountTypeForLabel(label) &&
          normalize(metric.label).includes(normalize(label)),
      ),
    )
    .map(({ amount }) => amount);
  const currencyFailures = parseCurrencyClaims(text).filter(({ amount, index }) => {
    if (coordinatedAmounts.includes(amount)) return false;
    const label = getNearbyLabel(text, index);
    if (comparisonAmounts.includes(amount)) return false;
    if (!label) return !metrics.some((metric) => metric.amount === amount);
    const amountType = getAmountTypeForLabel(label);
    return !metrics.some(
      (metric) =>
        metric.amount === amount &&
        metric.amountType === amountType &&
        normalize(metric.label).includes(normalize(label)),
    );
  });

  const percentages = cards.flatMap((card) =>
    card.type === "categoryBreakdown"
      ? card.categories.map(({ name, percentage }) => ({ label: name, percentage }))
      : [],
  );
  const income = metrics.find(({ amountType }) => amountType === "income")?.amount;
  const balance = metrics.find(
    ({ amountType, label }) => amountType === "balance" && /収支|差額/.test(label),
  )?.amount;
  if (income && balance !== undefined) {
    percentages.push({ label: "貯蓄率", percentage: (balance / income) * 100 });
  }
  const percentageFailures = [...text.matchAll(/(-?[\d,]+(?:\.\d+)?)\s*[%％]/g)]
    .map((match) => ({
      percentage: Number(match[1]!.replaceAll(",", "")),
      label: text
        .slice(Math.max(0, match.index - 12), match.index)
        .match(/貯蓄率|[\p{Script=Han}・]+/gu)
        ?.at(-1),
    }))
    .filter(
      (claim) =>
        !percentages.some(
          (source) =>
            Math.abs(source.percentage - claim.percentage) < 0.05 &&
            (!claim.label || normalize(source.label).includes(normalize(claim.label))),
        ),
    )
    .map(({ percentage }) => percentage);

  const unsupportedPeriods = getUnsupportedPeriods(text, expectedPeriods);

  const routes = getRoutes(cards);
  const links = [
    ...[...text.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]!),
    ...[...text.matchAll(/https?:\/\/[^\s)]+/g)].map((match) => match[0]),
  ];
  const unsupportedLinks = [...new Set(links.filter((link) => !routes.includes(link)))];
  const balanceMetric = metrics.find(({ label }) => /収支|差額/.test(label));
  const invertedBalance =
    (text.includes("赤字") && balanceMetric && balanceMetric.amount >= 0) ||
    (text.includes("黒字") && balanceMetric && balanceMetric.amount < 0) ||
    (balanceMetric &&
      balanceMetric.amount >= 0 &&
      /収支.{0,8}マイナス|支出.{0,12}収入.{0,8}上回/.test(text)) ||
    (balanceMetric &&
      balanceMetric.amount < 0 &&
      /収支.{0,8}プラス|収入.{0,12}支出.{0,8}上回/.test(text));
  const comparisonClaim = /(?:前月|先月|前年).{0,24}(?:増|減|上回|下回)/.test(text);
  const unsupportedComparison = comparisonClaim && comparisonAmounts.length === 0;

  return [
    currencyFailures.length > 0
      ? `${location}の未根拠金額: ${[...new Set(currencyFailures.map(({ amount }) => amount))].join(", ")}`
      : undefined,
    percentageFailures.length > 0
      ? `${location}の未根拠割合: ${[...new Set(percentageFailures)].join(", ")}`
      : undefined,
    unsupportedPeriods.length > 0
      ? `${location}の未根拠期間: ${[...new Set(unsupportedPeriods)].join(", ")}`
      : undefined,
    unsupportedLinks.length > 0
      ? `${location}の未根拠リンク: ${unsupportedLinks.join(", ")}`
      : undefined,
    invertedBalance ? `${location}の黒字／赤字表現が card の収支と矛盾しています` : undefined,
    unsupportedComparison ? `${location}に根拠のない期間比較があります` : undefined,
  ].filter((failure): failure is string => failure !== undefined);
}

function getCardProse(cards: FinanceChatCard[]): string {
  return cards
    .flatMap((card) => [
      card.title,
      "description" in card ? card.description : undefined,
      "action" in card ? card.action?.label : undefined,
    ])
    .filter((value): value is string => typeof value === "string")
    .join("。 ");
}

function getTransactionKey(transaction: {
  id: string;
  date: string;
  description: string;
  category?: string;
  amount: number;
  amountType: string;
}): string {
  return [
    transaction.id,
    transaction.date,
    transaction.description,
    transaction.category ?? "",
    transaction.amount,
    transaction.amountType,
  ].join("|");
}

function sorted(values: string[]): string[] {
  return values.toSorted((left, right) => left.localeCompare(right));
}

function collectionsMatch(actual: string[], expected: string[]): boolean {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
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
  const metrics = getMetrics(result.cards);
  const expectedMetrics = config.expectedMetrics ?? [];
  const missingMetrics = expectedMetrics.filter(
    (expected) => !metrics.some((metric) => metricMatches(metric, expected)),
  );
  const unexpectedMetrics = expectedMetrics.length
    ? metrics.filter(
        (metric) => !expectedMetrics.some((expected) => metricMatches(metric, expected)),
      )
    : [];
  const allowedMetrics = config.allowedMetrics ?? [];
  let disallowedMetrics: MetricExpectation[] = [];
  if (allowedMetrics.length > 0) {
    disallowedMetrics = metrics.filter(
      (metric) => !allowedMetrics.some((allowed) => metricMatches(metric, allowed)),
    );
  } else if (config.allowedMetrics !== undefined && expectedMetrics.length === 0) {
    disallowedMetrics = metrics;
  }
  const categories = result.cards.flatMap((card) =>
    card.type === "categoryBreakdown" ? card.categories : [],
  );
  const expectedCategoryKeys = (config.expectedCategories ?? []).map(
    ({ label, amount, amountType, percentage }) =>
      `${label}|${amount}|${amountType}|${percentage.toFixed(2)}`,
  );
  const categoryKeys = categories.map(
    ({ name, amount, amountType, percentage }) =>
      `${name}|${amount}|${amountType}|${percentage.toFixed(2)}`,
  );
  const categoriesMatch =
    expectedCategoryKeys.length === 0 || collectionsMatch(categoryKeys, expectedCategoryKeys);
  const transactions = result.cards.flatMap((card) =>
    card.type === "transactionList" ? card.transactions : [],
  );
  const expectedTransactions = config.expectedTransactions ?? [];
  const transactionKeys = transactions.map(getTransactionKey);
  const transactionsMatch =
    expectedTransactions.length === 0 || collectionsMatch(transactionKeys, expectedTransactions);
  const transactionTotal = transactions.reduce((total, { amount }) => total + amount, 0);
  const chartValues = result.cards.flatMap((card) =>
    card.type === "chart" ? card.data.flatMap(({ values }) => values) : [],
  );
  const expectedChartValues = config.expectedChartValues ?? [];
  const chartValuesMatch =
    expectedChartValues.length === 0 ||
    collectionsMatch(chartValues.map(String), expectedChartValues.map(String));
  const comparisonAmounts =
    chartValuesMatch && expectedChartValues.length > 0
      ? [
          ...expectedChartValues,
          ...expectedChartValues.flatMap((left) =>
            expectedChartValues.map((right) => Math.abs(left - right)),
          ),
        ]
      : [];
  const detailAmounts =
    categoriesMatch && transactionsMatch
      ? [...categories.map(({ amount }) => amount), ...transactions.map(({ amount }) => amount)]
      : [];
  const trustedAmounts = [...comparisonAmounts, ...detailAmounts];
  const cardProse = getCardProse(result.cards);
  const missingPatterns = (config.requiredPatterns ?? []).filter(
    (pattern) => !new RegExp(pattern, "u").test(cardProse),
  );
  const forbiddenPhrases = (config.forbiddenPhrases ?? []).filter((phrase) =>
    visibleOutput.includes(normalize(phrase)),
  );
  const missingRoute =
    config.expectedRoute &&
    !getRoutes(result.cards).some((route) => route.endsWith(config.expectedRoute!))
      ? config.expectedRoute
      : undefined;
  const unexpectedRoutes = config.expectedRoute
    ? getRoutes(result.cards).filter((route) => !route.endsWith(config.expectedRoute!))
    : [];

  const failures = [
    missingFacts.length > 0 ? `期待 facts 不足: ${missingFacts.join(", ")}` : undefined,
    config.expectedAnyFacts?.length && !hasExpectedAlternative
      ? `期待候補 facts 不足: ${config.expectedAnyFacts.join(", ")}`
      : undefined,
    missingMetrics.length > 0
      ? `期待 metric 不足: ${missingMetrics.map(({ label }) => label).join(", ")}`
      : undefined,
    unexpectedMetrics.length > 0
      ? `未根拠 metric: ${unexpectedMetrics.map(({ label }) => label).join(", ")}`
      : undefined,
    disallowedMetrics.length > 0
      ? `未根拠 metric: ${disallowedMetrics.map(({ label }) => label).join(", ")}`
      : undefined,
    !categoriesMatch ? "カテゴリ collection が fixture と一致しません" : undefined,
    !transactionsMatch ? "取引明細 collection が fixture と一致しません" : undefined,
    !chartValuesMatch ? "chart values が fixture と一致しません" : undefined,
    missingPatterns.length > 0
      ? `card prose の必須 pattern 不足: ${missingPatterns.join(", ")}`
      : undefined,
    config.expectedTransactionTotal !== undefined &&
    transactionTotal !== config.expectedTransactionTotal
      ? `取引明細合計不一致: ${transactionTotal}（期待: ${config.expectedTransactionTotal}）`
      : undefined,
    !hasExpectedCardOrder
      ? `card 順序不一致: ${cardTypes.join(", ")}（期待: ${expectedCardTypes.join(", ")}）`
      : undefined,
    forbiddenPhrases.length > 0 ? `禁止表現: ${forbiddenPhrases.join(", ")}` : undefined,
    missingRoute ? `期待 route 不足: ${missingRoute}` : undefined,
    unexpectedRoutes.length > 0 ? `未根拠 route: ${unexpectedRoutes.join(", ")}` : undefined,
    result.text.trim() === "" && result.cards.length === 0 ? "最終回答が空です" : undefined,
    ...getTextClaimFailures(
      result.text,
      result.cards,
      config.expectedPeriods ?? [],
      trustedAmounts,
    ),
    ...getTextClaimFailures(
      cardProse,
      result.cards,
      config.expectedPeriods ?? [],
      trustedAmounts,
      "card prose",
    ),
  ].filter((failure): failure is string => failure !== undefined);

  return failures.length === 0
    ? { pass: true, score: 1, reason: "期待値と一致しました" }
    : { pass: false, score: 0, reason: failures.join(" / ") };
}
