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

interface VisibleMonthClaim {
  month: string;
  rolePattern?: string;
}

interface InsightMetricAllowance {
  amount: number;
  amountType: string;
  labelPattern: string;
}

interface CardTextFactExpectation {
  cardType: string;
  pattern: string;
}

interface DataToolFactExpectation {
  input?: unknown;
  path: string;
  toolName: string;
  value: unknown;
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
  expectedCount: number;
  allowedTransactions: TransactionExpectation[];
}

interface AssertionContext {
  config?: {
    allowedInsightMetrics?: InsightMetricAllowance[];
    allowedCardHeadingDates?: string[];
    allowedFallbackTextDates?: string[];
    allowedVisibleAmounts?: number[];
    allowedVisibleDates?: string[];
    allowedVisibleMonths?: string[];
    allowedVisiblePercentages?: number[];
    allowedVisibleTransactionCounts?: number[];
    expectedCardFacts?: string[];
    expectedCardActionFacts?: CardTextFactExpectation[];
    expectedCardHeadingFacts?: CardTextFactExpectation[];
    expectedCardTextFacts?: CardTextFactExpectation[];
    expectedCardTitleFacts?: CardTextFactExpectation[];
    expectedCardTypes?: string[];
    expectedCategories?: CategoryExpectation[];
    expectedDataToolFacts?: DataToolFactExpectation[];
    expectedInsightActionPattern?: string;
    expectedInsightFacts?: string[];
    expectedMetrics?: MetricExpectation[];
    expectedRoute?: string;
    expectedTransactionGroup?: TransactionGroupExpectation;
    expectedTransactions?: TransactionExpectation[];
    forbiddenVisiblePatterns?: string[];
    requiredInsightPatterns?: string[];
    requireInsightMetric?: boolean;
    visibleAmountClaims?: VisibleAmountClaim[];
    visibleMonthClaims?: VisibleMonthClaim[];
    visiblePercentageClaims?: VisibleAmountClaim[];
  };
}

interface EvaluationOutput {
  allowedHrefs: string[];
  dataToolResults: Array<{ toolName: string; input: unknown; output: unknown }>;
  text: string;
  cards: FinanceChatCard[];
}

type TransactionRow = Extract<FinanceChatCard, { type: "transactionList" }>["transactions"][number];

function parseOutput(output: string): EvaluationOutput | undefined {
  try {
    const value = JSON.parse(output) as Partial<EvaluationOutput>;
    const cards = financeChatCardsSchema.safeParse(value.cards);
    if (typeof value.text !== "string" || !cards.success) return undefined;
    return {
      allowedHrefs: Array.isArray(value.allowedHrefs)
        ? value.allowedHrefs.filter((href): href is string => typeof href === "string")
        : [],
      dataToolResults: Array.isArray(value.dataToolResults)
        ? value.dataToolResults
            .filter(
              (result): result is { toolName: string; input: unknown; output: unknown } =>
                typeof result === "object" &&
                result !== null &&
                "toolName" in result &&
                typeof result.toolName === "string" &&
                "output" in result,
            )
            .map((result) => ({ ...result, input: "input" in result ? result.input : undefined }))
        : [],
      text: value.text,
      cards: cards.data,
    };
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

function matchesPartial(actual: unknown, expected: unknown): boolean {
  if (typeof expected !== "object" || expected === null) return actual === expected;
  if (typeof actual !== "object" || actual === null) return false;
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) && expected.every((item, index) => matchesPartial(actual[index], item))
    );
  }
  return Object.entries(expected).every(([key, value]) =>
    matchesPartial((actual as Record<string, unknown>)[key], value),
  );
}

function collectValuesAtPath(value: unknown, path: string): unknown[] {
  const segments = path === "$" ? [] : path.replace(/^\$\.?/u, "").split(".");
  return segments.reduce<unknown[]>(
    (values, segment) => {
      if (segment === "*") {
        return values.flatMap((item) =>
          Array.isArray(item)
            ? item
            : typeof item === "object" && item !== null
              ? Object.values(item)
              : [],
        );
      }
      return values.flatMap((item) =>
        typeof item === "object" && item !== null && segment in item
          ? [(item as Record<string, unknown>)[segment]]
          : [],
      );
    },
    [value],
  );
}

function includesFact(actualFacts: string[], expected: string): boolean {
  const expectedMonth = /^(\d{4})-(\d{2})$/.exec(expected);
  if (expectedMonth) {
    const [, year, month] = expectedMonth;
    const numericMonth = String(Number(month));
    const monthPattern = new RegExp(
      `${year}(?:[-/.]0?${numericMonth}(?!\\d)|年0?${numericMonth}月)`,
      "u",
    );
    return actualFacts.some((actual) => monthPattern.test(normalize(actual)));
  }
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

function collectCardRoutes(output: EvaluationOutput): string[] {
  return output.cards.flatMap((card) => {
    const routes: string[] = [];
    if ("href" in card && card.href) routes.push(card.href);
    if ("action" in card && card.action) routes.push(card.action.href);
    return routes;
  });
}

function collectRoutes(output: EvaluationOutput): string[] {
  const cardRoutes = collectCardRoutes(output);
  const textRoutes = [output.text, ...collectFacts(output.cards)].flatMap((text) => [
    ...Array.from(
      text.matchAll(/(?<![\w:/])\/[A-Za-z0-9%._~!$&'*+,;=:@/?#-]+/g),
      ([route]) => route,
    ),
    ...Array.from(text.matchAll(/https?:\/\/[^\s)\]]+/gi), ([route]) => route),
  ]);
  return [...new Set([...cardRoutes, ...textRoutes])];
}

function collectVisibleAmounts(output: EvaluationOutput): number[] {
  return collectVisibleAmountMatches(output).map(({ amount }) => amount);
}

function collectVisibleClaimTexts(output: EvaluationOutput): string[] {
  return [
    output.text,
    ...output.cards.flatMap((card) => {
      const description =
        "description" in card && typeof card.description === "string" ? card.description : "";
      const headingText = [card.title, description].filter(Boolean).join(": ");
      const headingFields = new Set([card.title, description]);
      return [headingText, ...collectFacts(card).filter((fact) => !headingFields.has(fact))];
    }),
  ];
}

function collectBareVisibleAmountMatches(
  output: EvaluationOutput,
  expectedClaims: VisibleAmountClaim[],
): ReturnType<typeof collectVisibleAmountMatches> {
  const visibleTexts = [output.text, ...collectFacts(output.cards)].map((text) =>
    text.normalize("NFKC"),
  );
  return visibleTexts.flatMap((text) =>
    [
      ...new Set(expectedClaims.map(({ label }) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
      "(?:収入|支出|収支|総資産|総負債|黒字|赤字|余剰|手残り|残高|差額|金額|[\\p{L}・]{1,12}費)",
    ].flatMap((labelPattern) => {
      return [
        ...Array.from(
          text.matchAll(
            new RegExp(
              `${labelPattern}.{0,8}?([+\\-−▲△▼▽]?[\\d,]+)(?![\\d,]|[./-]\\d|\\s*(?:円|億|万|千|[%％]|年|月|日|件|項目|種類|個|つ|位|回|人|社|本|枚))`,
              "gu",
            ),
          ),
          (match) => ({
            amount:
              Number(
                String(match[1])
                  .replaceAll(",", "")
                  .replace(/[▲△▼▽−]/, "-"),
              ) *
              (/マイナス\s*$/.test(match[0].slice(0, match[0].lastIndexOf(String(match[1]))))
                ? -1
                : 1),
            endIndex: match.index + match[0].length,
            index: match.index + match[0].lastIndexOf(String(match[1])),
            text,
          }),
        ),
        ...Array.from(
          text.matchAll(
            new RegExp(
              `${labelPattern}.{0,8}?([+\\-−▲△▼▽]?)\\s*((?:[\\d,.]+\\s*(?:億|万|千)\\s*)+)(?![\\d,.]|\\s*(?:億|万|千|円))`,
              "gu",
            ),
          ),
          (match) => ({
            amount:
              parseVisibleAmount(undefined, match[2]) *
              (/[-−▲△▼▽]/u.test(match[1] ?? "") ||
              /マイナス\s*$/u.test(text.slice(Math.max(0, match.index - 8), match.index))
                ? -1
                : 1),
            endIndex: match.index + match[0].length,
            index: match.index + match[0].lastIndexOf(String(match[2])),
            text,
          }),
        ),
        ...Array.from(
          text.matchAll(
            new RegExp(
              `${labelPattern}.{0,8}?(?<![\\d,.])([〇零一二三四五六七八九十百千万億兆]*[兆億万千][〇零一二三四五六七八九十百千万億兆]*)(?![〇零一二三四五六七八九十百千万億兆]|\\s*円)`,
              "gu",
            ),
          ),
          (match) => ({
            amount:
              parseKanjiAmount(match[1]) *
              (/マイナス\s*$/u.test(match[0].slice(0, match[0].lastIndexOf(match[1]))) ? -1 : 1),
            endIndex: match.index + match[0].length,
            index: match.index + match[0].lastIndexOf(match[1]),
            text,
          }),
        ),
        ...Array.from(
          text.matchAll(new RegExp(`${labelPattern}.{0,8}?(ゼロ)(?!\\s*円)`, "gu")),
          (match) => ({
            amount: 0,
            endIndex: match.index + match[0].length,
            index: match.index + match[0].lastIndexOf(match[1]),
            text,
          }),
        ),
      ];
    }),
  );
}

function collectVisibleAmountMatches(output: EvaluationOutput) {
  const visibleTexts = collectVisibleClaimTexts(output).map((text) => text.normalize("NFKC"));
  return visibleTexts.flatMap((text) => [
    ...Array.from(
      text.matchAll(
        /(?:([+＋\-−▲△▼▽]?)\s*[¥￥]\s*([+＋\-−▲△▼▽]?)\s*([\d,.]+)|([+＋\-−▲△▼▽]?)\s*((?:[\d,.]+\s*(?:億|万|千)\s*)+[\d,.]*|[\d,.]+)\s*円)/g,
      ),
      (match) => ({
        amount:
          parseVisibleAmount(match[3], match[5]) *
          (/[-−▲△▼▽]/.test(`${match[1] ?? ""}${match[2] ?? ""}${match[4] ?? ""}`) ||
          isAccountingParenthesizedAmount(text, match.index, match.index + match[0].length) ||
          /マイナス\s*$/.test(text.slice(Math.max(0, match.index - 8), match.index))
            ? -1
            : 1),
        endIndex: match.index + match[0].length,
        index: match.index,
        text,
      }),
    ),
    ...Array.from(
      text.matchAll(/(?<![\d,.])[〇零一二三四五六七八九十百千万億兆]+\s*円/g),
      (match) => ({
        amount:
          parseKanjiAmount(match[0].replace(/\s*円$/, "")) *
          (/マイナス\s*$/.test(text.slice(Math.max(0, match.index - 8), match.index)) ? -1 : 1),
        endIndex: match.index + match[0].length,
        index: match.index,
        text,
      }),
    ),
    ...Array.from(text.matchAll(/ゼロ\s*円/g), (match) => ({
      amount: 0,
      endIndex: match.index + match[0].length,
      index: match.index,
      text,
    })),
  ]);
}

function parseKanjiAmount(value: string): number {
  const digits: Record<string, number> = {
    〇: 0,
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const parseSection = (section: string) => {
    let result = 0;
    let digit = 0;
    for (const character of section) {
      if (character in digits) {
        digit = digits[character]!;
      } else {
        result += (digit || 1) * { 十: 10, 百: 100, 千: 1000 }[character as "十" | "百" | "千"];
        digit = 0;
      }
    }
    return result + digit;
  };
  let total = 0;
  let section = "";
  for (const character of value) {
    if (character === "兆" || character === "億" || character === "万") {
      total +=
        parseSection(section) * { 兆: 1_000_000_000_000, 億: 100_000_000, 万: 10_000 }[character];
      section = "";
    } else {
      section += character;
    }
  }
  return total + parseSection(section);
}

function isAccountingParenthesizedAmount(text: string, startIndex: number, endIndex: number) {
  if (text[startIndex - 1] !== "(" || text[endIndex] !== ")") return false;
  const openingIndex = startIndex - 1;
  return openingIndex === 0 || /(?:は|が|では|なら)\s*$/u.test(text.slice(0, openingIndex));
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
  const matches = [
    ...collectVisibleAmountMatches(output),
    ...collectBareVisibleAmountMatches(output, expectedClaims),
  ];
  return matches.flatMap(({ amount, endIndex, index, text }) => {
    const { clauseEnd, clauseStart } = collectClauseBounds(text, index, endIndex);
    let nearbyClaims = expectedClaims
      .map((claim) => {
        const { label } = claim;
        const foundBeforeIndex = text.lastIndexOf(label, index);
        const foundAfterIndex = text.indexOf(label, endIndex);
        const beforeIndex = foundBeforeIndex >= clauseStart ? foundBeforeIndex : -1;
        const afterIndex =
          foundAfterIndex !== -1 && foundAfterIndex < clauseEnd ? foundAfterIndex : -1;
        const distance = Math.min(
          beforeIndex === -1 ? Number.POSITIVE_INFINITY : index - (beforeIndex + label.length),
          afterIndex === -1 ? Number.POSITIVE_INFINITY : afterIndex - endIndex,
        );
        const compoundPriority =
          !new Set(["収入", "支出", "収支", "金額", "差額", "残高"]).has(label) &&
          beforeIndex !== -1 &&
          new RegExp(
            `${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}の?(?:収入|支出|収支)`,
            "u",
          ).test(text.slice(beforeIndex, index))
            ? 1
            : 0;
        return { claim, compoundPriority, distance };
      })
      .filter(({ distance }) => distance <= 20)
      .sort(
        (left, right) =>
          right.compoundPriority - left.compoundPriority ||
          left.distance - right.distance ||
          right.claim.label.length - left.claim.label.length,
      );
    const clauseText = text.slice(clauseStart + 1, clauseEnd);
    if (nearbyClaims.length === 0) {
      const carriedLabel = collectCarriedClaimLabel(text, clauseStart, clauseText, expectedClaims);
      if (carriedLabel !== undefined) {
        nearbyClaims = expectedClaims
          .filter(({ label }) => label === carriedLabel)
          .map((claim) => ({ claim, compoundPriority: 0, distance: 0 }));
      }
    }
    const nearestLabel = nearbyClaims[0]?.claim.label;
    if (nearestLabel === undefined) return expectedClaims.length > 0 ? [`不明=${amount}`] : [];
    const claimsForLabel = nearbyClaims
      .filter(({ claim }) => claim.label === nearestLabel)
      .map(({ claim }) => claim);
    const context = collectClaimContext(text, index, endIndex);
    const roleSpecificClaims = claimsForLabel.filter(
      ({ rolePattern }) => rolePattern !== undefined && new RegExp(rolePattern, "u").test(context),
    );
    const applicableClaims =
      roleSpecificClaims.length > 0
        ? roleSpecificClaims
        : claimsForLabel.filter(({ rolePattern }) => rolePattern === undefined);
    if (hasNegatedSuffix(text, endIndex, clauseEnd)) {
      return [`${nearestLabel}=${amount}(否定)`];
    }
    if (
      applicableClaims.length === 0 ||
      applicableClaims.some((claim) => claim.amount === amount)
    ) {
      return [];
    }
    return [`${nearestLabel}=${amount}`];
  });
}

function hasNegatedSuffix(text: string, endIndex: number, clauseEnd: number): boolean {
  return /^\s*(?:では(?:ありません|ございません|ない|なく)|じゃ(?:ありません|ない)|とは(?:限りません|言えません)|でない)/u.test(
    text.slice(endIndex, clauseEnd),
  );
}

function isSentenceSeparator(text: string, index: number): boolean {
  const character = text[index];
  if (character === ".") {
    return !(/\d/u.test(text[index - 1] ?? "") && /\d/u.test(text[index + 1] ?? ""));
  }
  return character === "。" || character === "!" || character === "?" || character === "\n";
}

function collectCarriedClaimLabel<T extends { label: string }>(
  text: string,
  clauseStart: number,
  clauseText: string,
  expectedClaims: T[],
): string | undefined {
  if (
    (text[clauseStart] !== "、" && text[clauseStart] !== ",") ||
    !/^(?:前月|先月|比較|差額|差|増減|変化|今月|当月|\d{4}(?:年\d{1,2}月|[-/.]\d{1,2}))/u.test(
      clauseText.trimStart(),
    )
  ) {
    return undefined;
  }
  let sentenceStart = -1;
  for (let index = clauseStart - 1; index >= 0; index -= 1) {
    if (isSentenceSeparator(text, index)) {
      sentenceStart = index;
      break;
    }
  }
  return expectedClaims
    .map(({ label }) => ({ label, index: text.lastIndexOf(label, clauseStart - 1) }))
    .filter(({ index }) => index > sentenceStart)
    .sort((left, right) => right.index - left.index || right.label.length - left.label.length)[0]
    ?.label;
}

function collectClaimContext(text: string, startIndex: number, endIndex: number): string {
  const { clauseEnd, clauseStart } = collectClauseBounds(text, startIndex, endIndex);
  const clausePrefix = text.slice(clauseStart + 1, startIndex);
  const precedingClaims = Array.from(
    clausePrefix.matchAll(/[+\-−▲△▼▽]?\s*(?:[¥￥]\s*)?[\d,.]+(?:\s*(?:億|万|千))*\s*(?:円|[%％])/g),
  );
  const precedingClaim = precedingClaims.at(-1);
  if (precedingClaim?.index !== undefined) {
    return text.slice(clauseStart + 1 + precedingClaim.index + precedingClaim[0].length, endIndex);
  }
  const followingClause = text.slice(endIndex, clauseEnd);
  const nextClaim = /[+\-−▲△▼▽]?\s*(?:[¥￥]\s*)?[\d,.]+(?:\s*(?:億|万|千))*\s*(?:円|[%％])/.exec(
    followingClause,
  );
  if (nextClaim?.index !== undefined) {
    const textBeforeNextClaim = followingClause.slice(0, nextClaim.index);
    const nextRoleMarker = /(前月|先月|比較|差額|増減|変化|増加|減少|上回|下回)/.exec(
      textBeforeNextClaim,
    );
    const contextEnd = endIndex + (nextRoleMarker?.index ?? nextClaim.index);
    return text.slice(clauseStart + 1, contextEnd);
  }
  return text.slice(clauseStart + 1, clauseEnd);
}

function collectClauseBounds(text: string, startIndex: number, endIndex: number) {
  const isSeparator = (index: number) => {
    const character = text[index];
    if (character === "," || character === ".") {
      return !(/\d/u.test(text[index - 1] ?? "") && /\d/u.test(text[index + 1] ?? ""));
    }
    return (
      character === "、" ||
      character === "。" ||
      character === "!" ||
      character === "?" ||
      character === "\n"
    );
  };
  let clauseStart = -1;
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    if (isSeparator(index)) {
      clauseStart = index;
      break;
    }
  }
  let clauseEnd = text.length;
  for (let index = endIndex; index < text.length; index += 1) {
    if (isSeparator(index)) {
      clauseEnd = index;
      break;
    }
  }
  return {
    clauseEnd,
    clauseStart,
  };
}

function collectVisibleTransactionCounts(output: EvaluationOutput) {
  return [output.text, ...collectFacts(output.cards)].flatMap((rawText) => {
    const text = rawText.normalize("NFKC");
    return [
      ...Array.from(text.matchAll(/(?<![\d,])([\d,]+)\s*件/g), (match) => ({
        count: Number(match[1]?.replaceAll(",", "")),
        endIndex: match.index + match[0].length,
        index: match.index,
        text,
      })),
      ...Array.from(
        text.matchAll(
          /(?<![〇零一二三四五六七八九十百千万億兆])([〇零一二三四五六七八九十百千万億兆]+)\s*件/g,
        ),
        (match) => ({
          count: parseKanjiAmount(match[1] ?? ""),
          endIndex: match.index + match[0].length,
          index: match.index,
          text,
        }),
      ),
    ];
  });
}

function collectDates(rawTexts: string[]): string[] {
  return rawTexts.flatMap((rawText) => {
    const text = rawText.normalize("NFKC");
    return [
      ...Array.from(
        text.matchAll(/(?:昨日|一昨日|前日|明日|明後日|翌日)(?=の|時点|現在)/g),
        ([relativeDay]) => `relative-${relativeDay}`,
      ),
      ...Array.from(
        text.matchAll(
          /(令和|平成|昭和)(元|\d+|[〇零一二三四五六七八九十百]+)年(\d{1,2}|[〇零一二三四五六七八九十]+)月(\d{1,2}|[〇零一二三四五六七八九十]+)日/g,
        ),
        ([, era, eraYear, month, day]) =>
          `${toGregorianYear(era, eraYear)}-${String(parseJapaneseInteger(month)).padStart(2, "0")}-${String(parseJapaneseInteger(day)).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/([〇零一二三四五六七八九十]+)月([〇零一二三四五六七八九十]+)日/g),
        ([, month, day]) =>
          `*-${String(parseKanjiAmount(month)).padStart(2, "0")}-${String(parseKanjiAmount(day)).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/(?:昨年|去年|前年)(\d{1,2})月(\d{1,2})日/g),
        ([, month, day]) =>
          `last-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(
          /(?:昨年|去年|前年)([〇零一二三四五六七八九十]+)月([〇零一二三四五六七八九十]+)日/g,
        ),
        ([, month, day]) =>
          `last-${String(parseKanjiAmount(month)).padStart(2, "0")}-${String(parseKanjiAmount(day)).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/(?:来年|翌年)(\d{1,2})月(\d{1,2})日/g),
        ([, month, day]) =>
          `next-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(
          /(?:来年|翌年)([〇零一二三四五六七八九十]+)月([〇零一二三四五六七八九十]+)日/g,
        ),
        ([, month, day]) =>
          `next-${String(parseKanjiAmount(month)).padStart(2, "0")}-${String(parseKanjiAmount(day)).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/(\d{4})年([〇零一二三四五六七八九十]+)月([〇零一二三四五六七八九十]+)日/g),
        ([, year, month, day]) =>
          `${year}-${String(parseKanjiAmount(month)).padStart(2, "0")}-${String(parseKanjiAmount(day)).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g),
        ([, year, month, day]) =>
          `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/(?<![\d.-])(\d{1,2})[-.](\d{1,2})(?=\s*(?:時点|現在|の))/g),
        ([, month, day]) => `*-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/(?<!\d)(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})(?!\d)/g),
        ([, year, month, day]) =>
          `${year ?? "*"}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/g),
        ([, year, month, day]) =>
          `${year ?? "*"}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/\b(\d{4})\.(\d{1,2})\.(\d{1,2})\b/g),
        ([, year, month, day]) =>
          `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      ),
    ];
  });
}

function toGregorianYear(era: string, rawYear: string): number {
  const eraYear =
    rawYear === "元" ? 1 : /^\d+$/u.test(rawYear) ? Number(rawYear) : parseKanjiAmount(rawYear);
  const startYears: Record<string, number> = { 令和: 2018, 平成: 1988, 昭和: 1925 };
  return startYears[era]! + eraYear;
}

function parseJapaneseInteger(value: string): number {
  return /^\d+$/u.test(value) ? Number(value) : parseKanjiAmount(value);
}

function collectVisibleDates(output: EvaluationOutput): string[] {
  return collectDates([output.text, ...collectFacts(output.cards)]);
}

function collectCardHeadingDates(output: EvaluationOutput): string[] {
  return collectDates(
    output.cards.flatMap((card) => [
      card.title,
      "description" in card && typeof card.description === "string" ? card.description : "",
    ]),
  );
}

function collectVisibleMonths(output: EvaluationOutput): string[] {
  return [output.text, ...collectFacts(output.cards)].flatMap((rawText) => {
    const text = rawText.normalize("NFKC");
    return [
      ...Array.from(
        text.matchAll(/(?:先月|前月|来月|翌月)(?=末|の|時点|現在|\s|$)/g),
        ([relativeMonth]) => `relative-${relativeMonth}`,
      ),
      ...Array.from(
        text.matchAll(
          /(令和|平成|昭和)(元|\d+|[〇零一二三四五六七八九十百]+)年(\d{1,2}|[〇零一二三四五六七八九十]+)月/g,
        ),
        ([, era, eraYear, month]) =>
          `${toGregorianYear(era, eraYear)}-${String(parseJapaneseInteger(month)).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/([〇零一二三四五六七八九十]+)月/g),
        ([, month]) => `*-${String(parseKanjiAmount(month)).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/(?:昨年|去年|前年)(\d{1,2})月/g),
        ([, month]) => `last-${String(month).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/(?:昨年|去年|前年)([〇零一二三四五六七八九十]+)月/g),
        ([, month]) => `last-${String(parseKanjiAmount(month)).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/(?:来年|翌年)(\d{1,2})月/g),
        ([, month]) => `next-${String(month).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/(?:来年|翌年)([〇零一二三四五六七八九十]+)月/g),
        ([, month]) => `next-${String(parseKanjiAmount(month)).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/(\d{4})年([〇零一二三四五六七八九十]+)月/g),
        ([, year, month]) => `${year}-${String(parseKanjiAmount(month)).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/\b(\d{4})[-/.](\d{1,2})\b/g),
        ([, year, month]) => `${year}-${String(month).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/(\d{4})年(\d{1,2})月/g),
        ([, year, month]) => `${year}-${String(month).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(/(?<!\d)(\d{1,2})月/g),
        ([, month]) => `*-${String(month).padStart(2, "0")}`,
      ),
    ];
  });
}

function collectMislabeledVisibleMonths(
  output: EvaluationOutput,
  expectedClaims: VisibleMonthClaim[],
): string[] {
  if (expectedClaims.length === 0) return [];
  return [output.text, ...collectFacts(output.cards)].flatMap((rawText) => {
    const text = rawText.normalize("NFKC");
    const monthMatches = Array.from(
      text.matchAll(
        /(令和|平成|昭和)(元|\d+|[〇零一二三四五六七八九十百]+)年(\d{1,2}|[〇零一二三四五六七八九十]+)月|\b(\d{4})[-/.](\d{1,2})\b|(\d{4})年(\d{1,2})月|(?<![\d年])(\d{1,2})月/g,
      ),
      (match) => ({
        endIndex: match.index + match[0].length,
        index: match.index,
        month:
          match[1] !== undefined
            ? `${toGregorianYear(match[1], match[2])}-${String(parseJapaneseInteger(match[3])).padStart(2, "0")}`
            : match[4] !== undefined
              ? `${match[4]}-${String(match[5]).padStart(2, "0")}`
              : match[6] !== undefined
                ? `${match[6]}-${String(match[7]).padStart(2, "0")}`
                : `*-${String(match[8]).padStart(2, "0")}`,
      }),
    );
    return monthMatches.flatMap((monthMatch, monthIndex) => {
      const { clauseEnd, clauseStart } = collectClauseBounds(
        text,
        monthMatch.index,
        monthMatch.endIndex,
      );
      const adjacentRoleContext = `${text.slice(Math.max(0, monthMatch.index - 8), monthMatch.index)} ${
        /^\s*[（(]?(前月|先月)/.exec(
          text.slice(monthMatch.endIndex, monthMatch.endIndex + 8),
        )?.[0] ?? ""
      }`;
      const isExpectedComparisonMonth = expectedClaims.some(
        ({ month, rolePattern }) =>
          rolePattern !== undefined &&
          (monthMatch.month === month || monthMatch.month === `*-${month.slice(5)}`),
      );
      const roleContext = `${adjacentRoleContext} ${
        isExpectedComparisonMonth && /比較/u.test(text.slice(clauseStart + 1, clauseEnd))
          ? "比較"
          : ""
      }`;
      const roleSpecificClaims = expectedClaims.filter(
        ({ rolePattern }) =>
          rolePattern !== undefined && new RegExp(rolePattern, "u").test(roleContext),
      );
      const applicableClaims =
        roleSpecificClaims.length > 0
          ? roleSpecificClaims
          : expectedClaims.filter(({ rolePattern }) => rolePattern === undefined);
      const matchesExpected = applicableClaims.some(
        ({ month }) => monthMatch.month === month || monthMatch.month === `*-${month.slice(5)}`,
      );
      return matchesExpected ? [] : [`${monthIndex + 1}:${monthMatch.month}`];
    });
  });
}

function collectVisiblePercentageMatches(output: EvaluationOutput) {
  return collectVisibleClaimTexts(output)
    .map((text) => text.normalize("NFKC"))
    .flatMap((text) => [
      ...Array.from(
        text.matchAll(
          /([+＋\-−▲△▼▽]?)\s*(?:([\d,.]+)\s*(?:%|パーセント)|([\d.]+)\s*割(?:\s*(\d+)\s*分)?(?:\s*(\d+)\s*厘)?|([〇零一二三四五六七八九十百]+)\s*パーセント|([〇零一二三四五六七八九十]+)\s*割(?:\s*([〇零一二三四五六七八九十]+)\s*分)?(?:\s*([〇零一二三四五六七八九十]+)\s*厘)?|([\d,.]+)\s*ポイント)/g,
        ),
        (match) => ({
          amount:
            (match[2] !== undefined
              ? Number(match[2].replaceAll(",", ""))
              : match[3] !== undefined
                ? Number(match[3]) * 10 + Number(match[4] ?? 0) + Number(match[5] ?? 0) / 10
                : match[6] !== undefined
                  ? parseKanjiAmount(match[6])
                  : match[7] !== undefined
                    ? parseKanjiAmount(match[7]) * 10 +
                      parseKanjiAmount(match[8] ?? "") +
                      parseKanjiAmount(match[9] ?? "") / 10
                    : Number(match[10]?.replaceAll(",", ""))) *
            (/[-−▲△▼▽]/.test(match[1] ?? "") ||
            /マイナス\s*$/.test(text.slice(Math.max(0, match.index - 8), match.index))
              ? -1
              : 1),
          endIndex: match.index + match[0].length,
          index: match.index,
          isPoint: match[10] !== undefined,
          text,
        }),
      ).filter(
        (match) =>
          !match.isPoint ||
          match.text
            .slice(Math.max(0, match.index - 16), match.endIndex + 8)
            .match(/(?:率|前月比|前年比|比較|増減|差|上昇|低下|増加|減少)/u) !== null,
      ),
      ...Array.from(
        text.matchAll(
          /(?:半分|([\d]+|[〇零一二三四五六七八九十]+)分の([\d]+|[〇零一二三四五六七八九十]+))/g,
        ),
        (match) => ({
          amount:
            match[1] === undefined
              ? 50
              : (parseJapaneseInteger(match[2]) / parseJapaneseInteger(match[1])) * 100,
          endIndex: match.index + match[0].length,
          index: match.index,
          text,
        }),
      ).filter(
        (match) =>
          match.text
            .slice(Math.max(0, match.index - 16), match.endIndex + 8)
            .match(/(?:率|割合|比率|パーセント)/u) !== null,
      ),
    ]);
}

function collectMislabeledVisiblePercentages(
  output: EvaluationOutput,
  expectedClaims: VisibleAmountClaim[],
): string[] {
  return collectVisiblePercentageMatches(output).flatMap(({ amount, endIndex, index, text }) => {
    const { clauseEnd, clauseStart } = collectClauseBounds(text, index, endIndex);
    let nearbyClaims = expectedClaims
      .map((claim) => {
        const foundBeforeIndex = text.lastIndexOf(claim.label, index);
        const foundAfterIndex = text.indexOf(claim.label, endIndex);
        const beforeIndex = foundBeforeIndex >= clauseStart ? foundBeforeIndex : -1;
        const afterIndex =
          foundAfterIndex !== -1 && foundAfterIndex < clauseEnd ? foundAfterIndex : -1;
        return {
          claim,
          distance: Math.min(
            beforeIndex === -1
              ? Number.POSITIVE_INFINITY
              : index - (beforeIndex + claim.label.length),
            afterIndex === -1 ? Number.POSITIVE_INFINITY : afterIndex - endIndex,
          ),
        };
      })
      .filter(({ distance }) => distance <= 20)
      .sort(
        (left, right) =>
          left.distance - right.distance || right.claim.label.length - left.claim.label.length,
      );
    if (nearbyClaims.length === 0) {
      const clauseText = text.slice(clauseStart + 1, clauseEnd);
      const carriedLabel = collectCarriedClaimLabel(text, clauseStart, clauseText, expectedClaims);
      if (carriedLabel !== undefined) {
        nearbyClaims = expectedClaims
          .filter(({ label }) => label === carriedLabel)
          .map((claim) => ({ claim, distance: 0 }));
      }
    }
    if (nearbyClaims.length === 0) return expectedClaims.length > 0 ? [`不明=${amount}`] : [];
    const nearestLabel = nearbyClaims[0]?.claim.label;
    const claimsForLabel = nearbyClaims
      .filter(({ claim }) => claim.label === nearestLabel)
      .map(({ claim }) => claim);
    const context = collectClaimContext(text, index, endIndex);
    const roleSpecificClaims = claimsForLabel.filter(
      ({ rolePattern }) => rolePattern !== undefined && new RegExp(rolePattern, "u").test(context),
    );
    const hasDirectionalSuffix = /^\s*(?:ポイント)?(?:増|減|上昇|低下|増加|減少|上が|下が)/u.test(
      text.slice(endIndex, clauseEnd),
    );
    const applicableClaims =
      roleSpecificClaims.length > 0
        ? roleSpecificClaims
        : hasDirectionalSuffix
          ? []
          : claimsForLabel.filter(({ rolePattern }) => rolePattern === undefined);
    if (hasNegatedSuffix(text, endIndex, clauseEnd)) {
      return [`${nearestLabel}=${amount}(否定)`];
    }
    return applicableClaims.some((claim) => Math.abs(claim.amount - amount) <= 0.01)
      ? []
      : [`${nearestLabel}=${amount}`];
  });
}

export default function assertFinanceResponse(output: string, context: AssertionContext = {}) {
  const parsed = parseOutput(output);
  if (!parsed) return { pass: false, score: 0, reason: "text/cards の評価 JSON が不正です。" };

  const config = context.config ?? {};
  const unexpectedVisibleAmounts = [
    ...collectVisibleAmounts(parsed),
    ...collectBareVisibleAmountMatches(parsed, config.visibleAmountClaims ?? []).map(
      ({ amount }) => amount,
    ),
  ].filter((amount) => !(config.allowedVisibleAmounts ?? []).includes(amount));
  const mislabeledVisibleAmounts = collectMislabeledVisibleAmounts(
    parsed,
    config.visibleAmountClaims ?? [],
  );
  const unexpectedVisibleDates =
    config.allowedVisibleDates === undefined
      ? []
      : collectVisibleDates(parsed).filter(
          (actualDate) =>
            !config.allowedVisibleDates?.some(
              (allowedDate) =>
                actualDate === allowedDate || actualDate === `*-${allowedDate.slice(5)}`,
            ),
        );
  const unexpectedFallbackTextDates =
    config.allowedFallbackTextDates === undefined
      ? []
      : collectDates([parsed.text]).filter(
          (actualDate) =>
            !config.allowedFallbackTextDates?.some(
              (allowedDate) =>
                actualDate === allowedDate || actualDate === `*-${allowedDate.slice(5)}`,
            ),
        );
  const unexpectedCardHeadingDates =
    config.allowedCardHeadingDates === undefined
      ? []
      : collectCardHeadingDates(parsed).filter(
          (actualDate) =>
            !config.allowedCardHeadingDates?.some(
              (allowedDate) =>
                actualDate === allowedDate || actualDate === `*-${allowedDate.slice(5)}`,
            ),
        );
  const unexpectedVisibleMonths =
    config.allowedVisibleMonths === undefined
      ? []
      : collectVisibleMonths(parsed).filter(
          (month) =>
            !(
              config.allowedVisibleMonths?.some(
                (allowedMonth) => month === allowedMonth || month === `*-${allowedMonth.slice(5)}`,
              ) ||
              (month.startsWith("relative-") &&
                config.visibleMonthClaims?.some(
                  ({ rolePattern }) =>
                    rolePattern !== undefined &&
                    new RegExp(rolePattern, "u").test(month.slice("relative-".length)),
                ))
            ),
        );
  const mislabeledVisibleMonths = collectMislabeledVisibleMonths(
    parsed,
    config.visibleMonthClaims ?? [],
  );
  const unexpectedVisiblePercentages =
    config.allowedVisiblePercentages === undefined
      ? []
      : collectVisiblePercentageMatches(parsed).filter(
          ({ amount }) =>
            !config.allowedVisiblePercentages?.some(
              (allowed) => Math.abs(allowed - amount) <= 0.01,
            ),
        );
  const mislabeledVisiblePercentages = collectMislabeledVisiblePercentages(
    parsed,
    config.visiblePercentageClaims ?? [],
  );
  const visibleText = [parsed.text, ...collectFacts(parsed.cards)].join("\n");
  const matchedForbiddenVisiblePatterns = (config.forbiddenVisiblePatterns ?? []).filter(
    (pattern) => new RegExp(pattern, "u").test(visibleText),
  );
  const cardFacts = collectFacts(parsed.cards);
  const missingDataToolFacts = (config.expectedDataToolFacts ?? []).filter(
    (expected) =>
      !parsed.dataToolResults.some(
        (result) =>
          result.toolName === expected.toolName &&
          (expected.input === undefined || matchesPartial(result.input, expected.input)) &&
          collectValuesAtPath(result.output, expected.path).some((actual) =>
            matchesPartial(actual, expected.value),
          ),
      ),
  );
  const missingCardFacts = (config.expectedCardFacts ?? []).filter(
    (expected) => !includesFact(cardFacts, expected),
  );
  const missingCardTextFacts = (config.expectedCardTextFacts ?? []).filter(
    ({ cardType, pattern }) =>
      !parsed.cards.some(
        (card) =>
          card.type === cardType && new RegExp(pattern, "u").test(collectFacts(card).join("\n")),
      ),
  );
  const missingCardActionFacts = (config.expectedCardActionFacts ?? []).filter(
    ({ cardType, pattern }) =>
      !parsed.cards.some(
        (card) =>
          card.type === cardType &&
          "action" in card &&
          card.action !== undefined &&
          new RegExp(pattern, "u").test(card.action.label),
      ),
  );
  const missingCardHeadingFacts = (config.expectedCardHeadingFacts ?? []).filter(
    ({ cardType, pattern }) =>
      !parsed.cards.some((card) => {
        if (card.type !== cardType) return false;
        const headingText = [
          card.title,
          "description" in card && typeof card.description === "string" ? card.description : "",
        ].join("\n");
        return new RegExp(pattern, "u").test(headingText);
      }),
  );
  const missingCardTitleFacts = (config.expectedCardTitleFacts ?? []).filter(
    ({ cardType, pattern }) =>
      !parsed.cards.some(
        (card) => card.type === cardType && new RegExp(pattern, "u").test(card.title),
      ),
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
  const expectedTransactionGroup = config.expectedTransactionGroup;
  const expectedVisibleTransactionCount =
    expectedTransactions.length > 0
      ? expectedTransactions.length
      : expectedTransactionGroup?.expectedCount;
  const visibleTransactionCounts = collectVisibleTransactionCounts(parsed);
  const isExplicitSourceTotal = ({
    count,
    endIndex,
    index,
    text,
  }: (typeof visibleTransactionCounts)[number]) =>
    config.allowedVisibleTransactionCounts?.includes(count) === true &&
    ((/全\s*$/u.test(text.slice(0, index)) && /^\s*中/u.test(text.slice(endIndex))) ||
      /^\s*の?うち/u.test(text.slice(endIndex)));
  const unexpectedVisibleTransactionCounts =
    expectedVisibleTransactionCount === undefined
      ? []
      : visibleTransactionCounts.filter((visibleCount) => {
          const { count } = visibleCount;
          if (count === expectedVisibleTransactionCount) return false;
          return !isExplicitSourceTotal(visibleCount);
        });
  const truncationDisclosureMissing =
    expectedVisibleTransactionCount !== undefined &&
    config.allowedVisibleTransactionCounts?.some(
      (sourceCount) => sourceCount > expectedVisibleTransactionCount,
    ) === true &&
    (!visibleTransactionCounts.some(({ count }) => count === expectedVisibleTransactionCount) ||
      !visibleTransactionCounts.some(isExplicitSourceTotal));
  const transactionsMismatch =
    expectedTransactions.length > 0 &&
    !transactionsMatchExactly(transactionRows, expectedTransactions);
  const transactionGroupMismatch =
    expectedTransactionGroup !== undefined &&
    (transactionRows.length !== expectedTransactionGroup.expectedCount ||
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
    ((config.requireInsightMetric === true && insightMetrics.length === 0) ||
      insightMetrics.some(
        (actual) =>
          !allowedInsightMetrics.some(
            (allowed) =>
              actual.amount === allowed.amount &&
              actual.amountType === allowed.amountType &&
              new RegExp(allowed.labelPattern, "u").test(actual.label),
          ),
      ));
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
  const cardRoutes = collectCardRoutes(parsed);
  const routeMismatch =
    config.expectedRoute &&
    (!cardRoutes.includes(config.expectedRoute) ||
      !parsed.allowedHrefs.includes(config.expectedRoute) ||
      actualRoutes.some((route) => route !== config.expectedRoute));

  const failures = [
    unexpectedVisibleAmounts.length > 0
      ? `未許可の可視金額: ${[...new Set(unexpectedVisibleAmounts)].join(",")}`
      : undefined,
    mislabeledVisibleAmounts.length > 0
      ? `誤ラベルの可視金額: ${[...new Set(mislabeledVisibleAmounts)].join(",")}`
      : undefined,
    unexpectedVisibleDates.length > 0
      ? `未許可の可視日付: ${[...new Set(unexpectedVisibleDates)].join(",")}`
      : undefined,
    unexpectedFallbackTextDates.length > 0
      ? `未許可の回答本文日付: ${[...new Set(unexpectedFallbackTextDates)].join(",")}`
      : undefined,
    unexpectedCardHeadingDates.length > 0
      ? `未許可のカード見出し日付: ${[...new Set(unexpectedCardHeadingDates)].join(",")}`
      : undefined,
    unexpectedVisibleMonths.length > 0
      ? `未許可の可視月: ${[...new Set(unexpectedVisibleMonths)].join(",")}`
      : undefined,
    mislabeledVisibleMonths.length > 0
      ? `誤役割の可視月: ${[...new Set(mislabeledVisibleMonths)].join(",")}`
      : undefined,
    unexpectedVisiblePercentages.length > 0
      ? `未許可の可視割合: ${[...new Set(unexpectedVisiblePercentages.map(({ amount }) => amount))].join(",")}`
      : undefined,
    mislabeledVisiblePercentages.length > 0
      ? `誤ラベルの可視割合: ${[...new Set(mislabeledVisiblePercentages)].join(",")}`
      : undefined,
    matchedForbiddenVisiblePatterns.length > 0
      ? `禁止された可視表現: ${matchedForbiddenVisiblePatterns.join(",")}`
      : undefined,
    missingCardFacts.length > 0 ? `不足 card facts: ${missingCardFacts.join(", ")}` : undefined,
    missingDataToolFacts.length > 0
      ? `不足 data tool facts: ${missingDataToolFacts.map(({ toolName, path }) => `${toolName}:${path}`).join(", ")}`
      : undefined,
    missingCardTextFacts.length > 0
      ? `不足 card text facts: ${missingCardTextFacts.map(({ cardType, pattern }) => `${cardType}=${pattern}`).join(",")}`
      : undefined,
    missingCardActionFacts.length > 0
      ? `不足 card action facts: ${missingCardActionFacts.map(({ cardType, pattern }) => `${cardType}=${pattern}`).join(",")}`
      : undefined,
    missingCardHeadingFacts.length > 0
      ? `不足 card heading facts: ${missingCardHeadingFacts.map(({ cardType, pattern }) => `${cardType}=${pattern}`).join(",")}`
      : undefined,
    missingCardTitleFacts.length > 0
      ? `不足 card title facts: ${missingCardTitleFacts.map(({ cardType, pattern }) => `${cardType}=${pattern}`).join(",")}`
      : undefined,
    summaryMetricsMismatch
      ? `summary metrics 不一致: expected=${expectedMetrics.map(({ label, amount }) => `${label}=${amount}`).join(",")}`
      : undefined,
    categoriesMismatch
      ? `categories 不一致: expected=${expectedCategories.map(({ label, amount, percentage }) => `${label}=${amount}/${percentage}%`).join(",")}`
      : undefined,
    transactionsMismatch ? "transactions 不一致" : undefined,
    unexpectedVisibleTransactionCounts.length > 0
      ? `明細件数 不一致: expected=${expectedVisibleTransactionCount} actual=${[
          ...new Set(unexpectedVisibleTransactionCounts.map(({ count }) => count)),
        ].join(",")}`
      : undefined,
    truncationDisclosureMissing ? "明細の省略件数表示がありません" : undefined,
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
