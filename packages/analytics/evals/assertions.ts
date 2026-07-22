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
  basisPattern?: string;
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

interface DerivedVisibleClaim {
  amount: number;
  sourceValues: number[];
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
    derivedVisibleClaims?: DerivedVisibleClaim[];
    expectedInsightActionPattern?: string;
    expectedInsightFacts?: string[];
    expectedMetrics?: MetricExpectation[];
    expectedRoute?: string;
    expectedTransactionGroup?: TransactionGroupExpectation;
    expectedTransactions?: TransactionExpectation[];
    forbiddenVisiblePatterns?: string[];
    requiredInsightPatterns?: string[];
    requireInsightMetric?: boolean;
    requireTransactionToolGrounding?: boolean;
    visibleAmountClaims?: VisibleAmountClaim[];
    visibleMonthClaims?: VisibleMonthClaim[];
    visiblePercentageClaims?: VisibleAmountClaim[];
  };
}

interface EvaluationOutput {
  allowedHrefs: string[];
  dataToolResults: DataToolResult[];
  evidenceShapeValid: boolean;
  securityEvidenceShapeValid: boolean;
  text: string;
  textEvidence: Array<{ text: string; allowedHrefs: string[]; dataToolResults: DataToolResult[] }>;
  unauthorizedLinks: string[];
  cards: FinanceChatCard[];
}

interface DataToolResult {
  toolName: string;
  input: unknown;
  output: unknown;
}

type TransactionRow = Extract<FinanceChatCard, { type: "transactionList" }>["transactions"][number];

const FINANCE_AMOUNT_LABELS = [
  "収入",
  "給与",
  "給料",
  "所得",
  "手取り",
  "売上",
  "報酬",
  "賃金",
  "年収",
  "月収",
  "支出",
  "収支",
  "総資産",
  "保有資産",
  "資産",
  "総負債",
  "負債",
  "黒字",
  "赤字",
  "余剰",
  "手残り",
  "残高",
  "差額",
  "金額",
];

function parseOutput(output: string): EvaluationOutput | undefined {
  try {
    const value = JSON.parse(output) as Partial<EvaluationOutput>;
    const cards = financeChatCardsSchema.safeParse(value.cards);
    if (typeof value.text !== "string" || !cards.success) return undefined;
    const isDataToolResult = (result: unknown): result is DataToolResult =>
      typeof result === "object" &&
      result !== null &&
      "toolName" in result &&
      typeof result.toolName === "string" &&
      "output" in result;
    const parseDataToolResults = (results: unknown): DataToolResult[] =>
      Array.isArray(results)
        ? results
            .filter(isDataToolResult)
            .map((result) => ({ ...result, input: "input" in result ? result.input : undefined }))
        : [];
    const stringArrayIsValid = (array: unknown): array is string[] =>
      Array.isArray(array) && array.every((item) => typeof item === "string");
    const dataToolResultsAreValid = (array: unknown): array is DataToolResult[] =>
      Array.isArray(array) && array.every(isDataToolResult);
    const textEvidenceIsValid =
      Array.isArray(value.textEvidence) &&
      value.textEvidence.every(
        (evidence) =>
          typeof evidence === "object" &&
          evidence !== null &&
          "text" in evidence &&
          typeof evidence.text === "string" &&
          (!("allowedHrefs" in evidence) || stringArrayIsValid(evidence.allowedHrefs)) &&
          (!("dataToolResults" in evidence) || dataToolResultsAreValid(evidence.dataToolResults)),
      );
    return {
      allowedHrefs: Array.isArray(value.allowedHrefs)
        ? value.allowedHrefs.filter((href): href is string => typeof href === "string")
        : [],
      dataToolResults: parseDataToolResults(value.dataToolResults),
      evidenceShapeValid:
        stringArrayIsValid(value.allowedHrefs) &&
        dataToolResultsAreValid(value.dataToolResults) &&
        textEvidenceIsValid &&
        stringArrayIsValid(value.unauthorizedLinks),
      text: value.text,
      securityEvidenceShapeValid:
        (value.allowedHrefs === undefined || stringArrayIsValid(value.allowedHrefs)) &&
        (value.unauthorizedLinks === undefined || stringArrayIsValid(value.unauthorizedLinks)),
      unauthorizedLinks: Array.isArray(value.unauthorizedLinks)
        ? value.unauthorizedLinks.filter((link): link is string => typeof link === "string")
        : [],
      textEvidence: Array.isArray(value.textEvidence)
        ? value.textEvidence.flatMap((evidence) =>
            typeof evidence === "object" &&
            evidence !== null &&
            "text" in evidence &&
            typeof evidence.text === "string"
              ? [
                  {
                    text: evidence.text,
                    allowedHrefs:
                      "allowedHrefs" in evidence && Array.isArray(evidence.allowedHrefs)
                        ? evidence.allowedHrefs.filter(
                            (href): href is string => typeof href === "string",
                          )
                        : [],
                    dataToolResults: parseDataToolResults(
                      "dataToolResults" in evidence ? evidence.dataToolResults : [],
                    ),
                  },
                ]
              : [],
          )
        : [],
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

function dataToolResultMatches(result: DataToolResult, expected: DataToolFactExpectation): boolean {
  return (
    result.toolName === expected.toolName &&
    (expected.input === undefined || matchesPartial(result.input, expected.input)) &&
    collectValuesAtPath(result.output, expected.path).some((actual) =>
      matchesPartial(actual, expected.value),
    )
  );
}

function collectNumericValues(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(collectNumericValues);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(collectNumericValues);
  }
  return [];
}

function dataToolFactSupportsLabel(expected: DataToolFactExpectation, label: string): boolean {
  const factText = `${expected.toolName} ${expected.path} ${JSON.stringify(expected.value)}`;
  if (/^(?:収入|給与|給料|所得|手取り|売上|報酬|賃金|年収|月収)$/u.test(label)) {
    return /(?:totalIncome|income)/iu.test(factText) && !/netIncome/iu.test(factText);
  }
  if (/^(?:支出|出費)$/u.test(label)) return /(?:totalExpense|expense)/iu.test(factText);
  if (/^(?:収支|黒字|赤字|余剰|手残り|純収入|プラス)$/u.test(label)) {
    return /netIncome/iu.test(factText);
  }
  if (/^(?:総資産|保有資産|資産)$/u.test(label)) {
    return /(?:getLatestTotalAssets|totalAssets)/iu.test(factText);
  }
  return normalize(factText).includes(normalize(label));
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

function transactionsMatchExpectedPrefix(
  actualRows: TransactionRow[],
  expectedRows: TransactionExpectation[],
): boolean {
  return actualRows.every((actual, index) => {
    const expected = expectedRows[index];
    return expected !== undefined && transactionMatches(actual, expected);
  });
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

function isApproximateAmountClaim(text: string, index: number, endIndex: number): boolean {
  return (
    /(?:約|およそ|概ね|だいたい)\s*$/u.test(text.slice(Math.max(0, index - 8), index)) ||
    /^\s*(?:ほど|程度|くらい|ぐらい)/u.test(text.slice(endIndex, endIndex + 8))
  );
}

function hasNegativeWordPrefix(value: string): boolean {
  return /(?:マイナス(?:\s*の)?|負\s*の)\s*(?:約|およそ|概ね|だいたい)?\s*$/u.test(value);
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
  return visibleTexts.flatMap((text) => {
    const labelPatterns = [
      ...new Set(expectedClaims.map(({ label }) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
      `(?:${FINANCE_AMOUNT_LABELS.join("|")}|[\\p{L}・]{1,12}費)`,
    ];
    const directMatches = labelPatterns.flatMap((labelPattern) => {
      return [
        ...Array.from(
          text.matchAll(
            new RegExp(
              `${labelPattern}.{0,8}?(?<![/\\d])([+\\-−▲△▼▽]?[\\d,]+)(?![\\d,]|[./-]\\d|\\s*(?:円|億|万|千|[%％]|年|月|か月|ヶ月|ケ月|箇月|日|件|項目|種類|個|つ|位|回|人|社|本|枚))`,
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
              (hasNegativeWordPrefix(match[0].slice(0, match[0].lastIndexOf(String(match[1]))))
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
              `(?<![./\\d-])([+\\-−▲△▼▽]?[\\d,]+)(?![\\d,]|[./-]\\d|\\s*(?:円|億|万|千|[%％]|年|月|か月|ヶ月|ケ月|箇月|日|件|項目|種類|個|つ|位|回|人|社|本|枚))(?=[^。！？\\n]{0,12}?${labelPattern})`,
              "gu",
            ),
          ),
          (match) => ({
            amount: Number(
              String(match[1])
                .replaceAll(",", "")
                .replace(/[▲△▼▽−]/, "-"),
            ),
            endIndex: match.index + match[0].length,
            index: match.index,
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
              hasNegativeWordPrefix(text.slice(Math.max(0, match.index - 8), match.index))
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
              (hasNegativeWordPrefix(match[0].slice(0, match[0].lastIndexOf(match[1]))) ? -1 : 1),
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
    });
    const continuationMatches = Array.from(
      text.matchAll(
        /[、，;；]\s*(?:前月|先月|今月|当月|比較(?:対象)?|差額|差|増減|変化)?[^\d]{0,4}?([+\-−▲△▼▽]?[\d,]+)(?![\d,]|[./-]\d|\s*(?:円|億|万|千|[%％]|ポイント|年|月|か月|ヶ月|ケ月|箇月|日|件|項目|種類|個|つ|位|回|人|社|本|枚))/gu,
      ),
      (match) => ({
        amount: Number(
          String(match[1])
            .replaceAll(",", "")
            .replace(/[▲△▼▽−]/, "-"),
        ),
        endIndex: match.index + match[0].length,
        index: match.index + match[0].lastIndexOf(String(match[1])),
        text,
      }),
    ).filter((match) => {
      const clauseStart = Math.max(
        text.lastIndexOf("。", match.index),
        text.lastIndexOf("！", match.index),
        text.lastIndexOf("？", match.index),
        text.lastIndexOf("\n", match.index),
      );
      const precedingClause = text.slice(clauseStart + 1, match.index);
      return labelPatterns.some((labelPattern) =>
        new RegExp(labelPattern, "u").test(precedingClause),
      );
    });
    return [...directMatches, ...continuationMatches];
  });
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
          hasNegativeWordPrefix(text.slice(Math.max(0, match.index - 8), match.index))
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
          (hasNegativeWordPrefix(text.slice(Math.max(0, match.index - 8), match.index)) ? -1 : 1),
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
    const nearestExpectedDistance = nearbyClaims[0]?.distance ?? Number.POSITIVE_INFINITY;
    const dynamicCategoryLabels = Array.from(
      text.matchAll(/[\p{L}・]{1,12}?費/gu),
      ([label]) => label.split(/(?:と比べ|に比べ|より|は|が|の)/u).at(-1) ?? label,
    );
    const nearerUnexpectedLabel = [...new Set([...FINANCE_AMOUNT_LABELS, ...dynamicCategoryLabels])]
      .filter(
        (label) =>
          !new Set(["差額", "金額", "残高"]).has(label) &&
          !expectedClaims.some((claim) => claim.label.includes(label)),
      )
      .map((label) => {
        const foundBeforeIndex = text.lastIndexOf(label, index);
        const foundAfterIndex = text.indexOf(label, endIndex);
        return {
          label,
          distance: Math.min(
            foundBeforeIndex !== -1 && foundBeforeIndex >= clauseStart
              ? index - (foundBeforeIndex + label.length)
              : Number.POSITIVE_INFINITY,
            foundAfterIndex !== -1 && foundAfterIndex < clauseEnd
              ? foundAfterIndex - endIndex
              : Number.POSITIVE_INFINITY,
          ),
        };
      })
      .filter(({ distance }) => distance < nearestExpectedDistance)
      .sort(
        (left, right) => left.distance - right.distance || right.label.length - left.label.length,
      )[0]?.label;
    if (nearerUnexpectedLabel !== undefined) return [`${nearerUnexpectedLabel}=${amount}`];
    const claimsForLabel = nearbyClaims
      .filter(({ claim }) => claim.label === nearestLabel)
      .map(({ claim }) => claim);
    const context = collectClaimContext(text, index, endIndex);
    const roleSpecificClaims = claimsForLabel.filter(
      ({ rolePattern }) => rolePattern !== undefined && new RegExp(rolePattern, "u").test(context),
    );
    const hasDirectionalSuffix =
      /^\s*(?:(?:の|から|より)\s*)?(?:増|減|上昇|低下|増加|減少|上が|下が)/u.test(
        text.slice(endIndex, clauseEnd),
      );
    const hasPrecedingComparisonDifference =
      /より/u.test(text.slice(clauseStart + 1, index)) &&
      /^\s*(?:多い|少ない)/u.test(text.slice(endIndex, clauseEnd));
    const applicableClaims =
      roleSpecificClaims.length > 0
        ? roleSpecificClaims
        : hasDirectionalSuffix || hasPrecedingComparisonDifference
          ? []
          : claimsForLabel.filter(({ rolePattern }) => rolePattern === undefined);
    const labelBeforeIndex = text.lastIndexOf(nearestLabel, index);
    if (
      labelBeforeIndex >= clauseStart &&
      /^\s*(?:以外|ではなく|でなく|ではない|でない)/u.test(
        text.slice(labelBeforeIndex + nearestLabel.length, index),
      )
    ) {
      return [`${nearestLabel}=${amount}(否定)`];
    }
    if (hasNegatedSuffix(text, endIndex, clauseEnd)) {
      return [`${nearestLabel}=${amount}(否定)`];
    }
    if (applicableClaims.length === 0) {
      return hasDirectionalSuffix || hasPrecedingComparisonDifference
        ? [`${nearestLabel}=${amount}(増減)`]
        : [];
    }
    if (
      applicableClaims.some(
        (claim) =>
          claim.amount === amount ||
          (isApproximateAmountClaim(text, index, endIndex) &&
            Math.abs(amount - claim.amount) <= Math.max(10, Math.abs(claim.amount) * 0.01)),
      )
    ) {
      return [];
    }
    return [`${nearestLabel}=${amount}`];
  });
}

function hasNegatedSuffix(text: string, endIndex: number, clauseEnd: number): boolean {
  return /^\s*(?:(?:ほど|程度|くらい|ぐらい)\s*)?(?:では(?:ありません|ございません|ない|なく)|じゃ(?:ありません|ない)|とは(?:限りません|言えません)|と(?:は)?\s*(?:異なります|異なる|違います|違う)|(?:増|減|上昇|低下|増加|減少)\s*(?:ではなく|でなく)|でない|未満|以下|以上|(?:の\s*)?\d+(?:\.\d+)?\s*倍|(?:を\s*)?超(?:え(?:ています|ます|る)?|です|である)?|より\s*(?:多い|少ない|上|下))/u.test(
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
  if (text[clauseStart] !== "、" && text[clauseStart] !== ",") return undefined;
  let sentenceStart = -1;
  for (let index = clauseStart - 1; index >= 0; index -= 1) {
    if (isSentenceSeparator(text, index)) {
      sentenceStart = index;
      break;
    }
  }
  const previousClaim = expectedClaims
    .map(({ label }) => ({ label, index: text.lastIndexOf(label, clauseStart - 1) }))
    .filter(({ index }) => index > sentenceStart)
    .sort((left, right) => right.index - left.index || right.label.length - left.label.length)[0];
  if (previousClaim === undefined) return undefined;
  const isComparisonContinuation =
    /^(?:前月|先月|比較|差額|差|増減|変化|今月|当月|\d{4}(?:年\d{1,2}月|[-/.]\d{1,2}))/u.test(
      clauseText.trimStart(),
    );
  const isTopicContinuation = /^\s*(?:は|が)\s*$/u.test(
    text.slice(previousClaim.index + previousClaim.label.length, clauseStart),
  );
  const isCorrectionContinuation = /(?:ではなく|でなく)\s*$/u.test(
    text.slice(previousClaim.index + previousClaim.label.length, clauseStart),
  );
  return isComparisonContinuation || isTopicContinuation || isCorrectionContinuation
    ? previousClaim.label
    : undefined;
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

function collectNearestClaimLabel(
  text: string,
  index: number,
  endIndex: number,
  claims: VisibleAmountClaim[],
): string | undefined {
  const { clauseEnd, clauseStart } = collectClauseBounds(text, index, endIndex);
  return claims
    .map(({ label }) => {
      const beforeIndex = text.lastIndexOf(label, index);
      const afterIndex = text.indexOf(label, endIndex);
      return {
        label,
        distance: Math.min(
          beforeIndex >= clauseStart
            ? index - (beforeIndex + label.length)
            : Number.POSITIVE_INFINITY,
          afterIndex !== -1 && afterIndex < clauseEnd
            ? afterIndex - endIndex
            : Number.POSITIVE_INFINITY,
        ),
      };
    })
    .filter(({ distance }) => Number.isFinite(distance))
    .sort(
      (left, right) => left.distance - right.distance || right.label.length - left.label.length,
    )[0]?.label;
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
        text.matchAll(/(?:昨日|一昨日|前日|明日|明後日|翌日)/g),
        ([relativeDay]) => `relative-${relativeDay}`,
      ),
      ...Array.from(
        text.matchAll(/(\d+|[〇零一二三四五六七八九十百]+)日(?:前|後)/g),
        ([relativeDay]) => `relative-${relativeDay}`,
      ),
      ...Array.from(
        text.matchAll(/(?:先月|前月|来月|翌月)\d{1,2}日/g),
        ([relativeDate]) => `relative-${relativeDate}`,
      ),
      ...Array.from(
        text.matchAll(/(?:先々週|先週|今週|来週|翌週)/g),
        ([relativeWeek]) => `relative-${relativeWeek}`,
      ),
      ...Array.from(
        text.matchAll(/(?:\d+|[〇零一二三四五六七八九十百]+)週間(?:前|後)/g),
        ([relativeWeek]) => `relative-${relativeWeek}`,
      ),
      ...Array.from(
        text.matchAll(/(?<![\d〇零一二三四五六七八九十])月(?:初|末)(?=の|は|が|時点|現在)/g),
        ([boundary]) => `relative-${boundary}`,
      ),
      ...Array.from(
        text.matchAll(/(?:(\d{4})年)?(\d{1,2})月(上旬|中旬|下旬)(?=の|は|が|時点|現在)/g),
        ([, year, month, period]) =>
          `period-${year ?? "*"}-${String(month).padStart(2, "0")}-${period}`,
      ),
      ...Array.from(
        text.matchAll(/(\d{4})年(初|末)(?=の|は|が|時点|現在)/g),
        ([, year, boundary]) => `${year}-${boundary === "初" ? "01-01" : "12-31"}`,
      ),
      ...Array.from(
        text.matchAll(/(\d{4})年度(初|末)(?=の|は|が|時点|現在)/g),
        ([, year, boundary]) => (boundary === "初" ? `${year}-04-01` : `${Number(year) + 1}-03-31`),
      ),
      ...Array.from(
        text.matchAll(
          /(令和|平成|昭和)(元|\d+|[〇零一二三四五六七八九十百]+)年(初|末)(?=の|は|が|時点|現在)/g,
        ),
        ([, era, eraYear, boundary]) =>
          `${toGregorianYear(era, eraYear)}-${boundary === "初" ? "01-01" : "12-31"}`,
      ),
      ...Array.from(
        text.matchAll(
          /(令和|平成|昭和)(元|\d+|[〇零一二三四五六七八九十百]+)年度(初|末)(?=の|は|が|時点|現在)/g,
        ),
        ([, era, eraYear, boundary]) => {
          const year = Number(toGregorianYear(era, eraYear));
          return boundary === "初" ? `${year}-04-01` : `${year + 1}-03-31`;
        },
      ),
      ...Array.from(
        text.matchAll(/(\d{4})年(\d{1,2})月(初|末)(?=の|は|が|時点|現在)/g),
        ([, year, month, boundary]) => {
          const numericMonth = Number(month);
          const day =
            boundary === "初" ? 1 : new Date(Date.UTC(Number(year), numericMonth, 0)).getUTCDate();
          return `${year}-${String(numericMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        },
      ),
      ...Array.from(
        text.matchAll(/(?<!\d)(\d{1,2})月(初|末)(?=の|は|が|時点|現在)/g),
        ([, month, boundary]) => {
          const numericMonth = Number(month);
          const day =
            boundary === "初" ? 1 : new Date(Date.UTC(2001, numericMonth, 0)).getUTCDate();
          return `*-${String(numericMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        },
      ),
      ...Array.from(
        text.matchAll(
          /(令和|平成|昭和)(元|\d+|[〇零一二三四五六七八九十百]+)年(\d{1,2}|[〇零一二三四五六七八九十]+)月(\d{1,2}|[〇零一二三四五六七八九十]+)日/g,
        ),
        ([, era, eraYear, month, day]) =>
          `${toGregorianYear(era, eraYear)}-${String(parseJapaneseInteger(month)).padStart(2, "0")}-${String(parseJapaneseInteger(day)).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(
          /([〇零一二三四五六七八九]{4})年([〇零一二三四五六七八九十]+)月([〇零一二三四五六七八九十]+)日/g,
        ),
        ([, year, month, day]) =>
          `${parseKanjiDigitSequence(year)}-${String(parseKanjiAmount(month)).padStart(2, "0")}-${String(parseKanjiAmount(day)).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(
          /((?=[〇零一二三四五六七八九十百千]*[十百千])[〇零一二三四五六七八九十百千]+)年([〇零一二三四五六七八九十]+)月([〇零一二三四五六七八九十]+)日/g,
        ),
        ([, year, month, day]) =>
          `${parseKanjiAmount(year)}-${String(parseKanjiAmount(month)).padStart(2, "0")}-${String(parseKanjiAmount(day)).padStart(2, "0")}`,
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

function parseKanjiDigitSequence(value: string): number {
  const digits: Record<string, string> = {
    〇: "0",
    零: "0",
    一: "1",
    二: "2",
    三: "3",
    四: "4",
    五: "5",
    六: "6",
    七: "7",
    八: "8",
    九: "9",
  };
  return Number(
    value
      .split("")
      .map((character) => digits[character])
      .join(""),
  );
}

function collectVisibleDates(output: EvaluationOutput): string[] {
  return collectDates([output.text, ...collectFacts(output.cards)]);
}

function collectNegatedTemporalClaims(output: EvaluationOutput): string[] {
  return [output.text, ...collectFacts(output.cards)].flatMap((rawText) => {
    const text = rawText.normalize("NFKC");
    return Array.from(
      text.matchAll(
        /((?:(?:\d{4}年)?\d{1,2}月(?:\d{1,2}日|初|末)?|\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?|\d{4}年(?:度|初|末)?|(?:令和|平成|昭和)(?:元|\d+|[〇零一二三四五六七八九十百]+)年(?:度|初|末)?|(?:昨日|一昨日|前日|明日|明後日|翌日|先月|前月|来月|翌月)))(?:時点|現在|分)?\s*(?:以外(?!\s*(?:では(?:ありません|ない)|じゃ(?:ありません|ない)|でない))|では(?:ありません|ない|なく)|じゃ(?:ありません|ない)|でない)/g,
      ),
      ([, claim]) => claim,
    );
  });
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
        text.matchAll(/(?:昨年|去年|前年|来年|翌年)/g),
        ([relativeYear]) => `relative-${relativeYear}`,
      ),
      ...Array.from(text.matchAll(/(?<!\d)(\d{4})年(?:度)?/g), ([, year]) => `year-${year}`),
      ...Array.from(
        text.matchAll(/(令和|平成|昭和)(元|\d+|[〇零一二三四五六七八九十百]+)年(?:度)?/g),
        ([, era, eraYear]) => `year-${toGregorianYear(era, eraYear)}`,
      ),
      ...Array.from(
        text.matchAll(/(?:先々月|昨々月|先月|前月|来月|翌月)/g),
        ([relativeMonth]) => `relative-${relativeMonth}`,
      ),
      ...Array.from(
        text.matchAll(/(\d+|[〇零一二三四五六七八九十百]+)\s*(?:か月|ヶ月|ケ月|箇月)(?:前|後)/g),
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
        text.matchAll(/([〇零一二三四五六七八九]{4})年([〇零一二三四五六七八九十]+)月/g),
        ([, year, month]) =>
          `${parseKanjiDigitSequence(year)}-${String(parseKanjiAmount(month)).padStart(2, "0")}`,
      ),
      ...Array.from(
        text.matchAll(
          /((?=[〇零一二三四五六七八九十百千]*[十百千])[〇零一二三四五六七八九十百千]+)年([〇零一二三四五六七八九十]+)月/g,
        ),
        ([, year, month]) =>
          `${parseKanjiAmount(year)}-${String(parseKanjiAmount(month)).padStart(2, "0")}`,
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
        /(令和|平成|昭和)(元|\d+|[〇零一二三四五六七八九十百]+)年(\d{1,2}|[〇零一二三四五六七八九十]+)月|(\d{4})年([〇零一二三四五六七八九十]+)月|([〇零一二三四五六七八九]{4})年([〇零一二三四五六七八九十]+)月|((?=[〇零一二三四五六七八九十百千]*[十百千])[〇零一二三四五六七八九十百千]+)年([〇零一二三四五六七八九十]+)月|\b(\d{4})[-/.](\d{1,2})\b|(\d{4})年(\d{1,2})月|(?<![\d年])(\d{1,2})月|([〇零一二三四五六七八九十]+)月/g,
      ),
      (match) => ({
        endIndex: match.index + match[0].length,
        index: match.index,
        month:
          match[1] !== undefined
            ? `${toGregorianYear(match[1], match[2])}-${String(parseJapaneseInteger(match[3])).padStart(2, "0")}`
            : match[4] !== undefined
              ? `${match[4]}-${String(parseJapaneseInteger(match[5])).padStart(2, "0")}`
              : match[6] !== undefined
                ? `${parseKanjiDigitSequence(match[6])}-${String(parseKanjiAmount(match[7])).padStart(2, "0")}`
                : match[8] !== undefined
                  ? `${parseKanjiAmount(match[8])}-${String(parseKanjiAmount(match[9])).padStart(2, "0")}`
                  : match[10] !== undefined
                    ? `${match[10]}-${String(match[11]).padStart(2, "0")}`
                    : match[12] !== undefined
                      ? `${match[12]}-${String(match[13]).padStart(2, "0")}`
                      : match[14] !== undefined
                        ? `*-${String(match[14]).padStart(2, "0")}`
                        : `*-${String(parseKanjiAmount(match[15])).padStart(2, "0")}`,
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
            hasNegativeWordPrefix(text.slice(Math.max(0, match.index - 8), match.index))
              ? -1
              : 1),
          endIndex: match.index + match[0].length,
          index: match.index,
          isPoint: match[10] !== undefined,
          strength: /^\s*(強|弱)/u.exec(text.slice(match.index + match[0].length))?.[1],
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
          isPoint: false,
          strength: undefined,
          text,
        }),
      ).filter(
        (match) =>
          match.text
            .slice(Math.max(0, match.index - 16), match.endIndex + 8)
            .match(/(?:率|割合|比率|パーセント)/u) !== null,
      ),
      ...Array.from(
        text.matchAll(/(?:率|割合|比率)[^。！？\n]{0,8}?小数(?:表記)?で\s*(0?\.\d+)/gu),
        (match) => ({
          amount: Number(match[1]) * 100,
          endIndex: match.index + match[0].length,
          index: match.index + match[0].lastIndexOf(match[1] ?? ""),
          isPoint: false,
          strength: undefined,
          text,
        }),
      ),
    ]);
}

function collectMislabeledVisiblePercentages(
  output: EvaluationOutput,
  expectedClaims: VisibleAmountClaim[],
): string[] {
  return collectVisiblePercentageMatches(output).flatMap(
    ({ amount, endIndex, index, isPoint, text }) => {
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
        const carriedLabel = collectCarriedClaimLabel(
          text,
          clauseStart,
          clauseText,
          expectedClaims,
        );
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
      const labelBeforeIndex = text.lastIndexOf(nearestLabel, index);
      if (
        labelBeforeIndex >= clauseStart &&
        /^\s*(?:ではなく|でなく|ではない|でない)/u.test(
          text.slice(labelBeforeIndex + nearestLabel.length, index),
        )
      ) {
        return [`${nearestLabel}=${amount}(否定)`];
      }
      const nearestExpectedDistance = nearbyClaims[0]?.distance ?? Number.POSITIVE_INFINITY;
      const dynamicPercentageLabels = Array.from(
        text.matchAll(/[\p{L}・]{1,12}?率/gu),
        ([label]) =>
          label.split(/(?:ではなく|でなく|と比べ|に比べ|より|は|が|の)/u).at(-1) ?? label,
      );
      const nearerUnexpectedLabel = [...new Set(dynamicPercentageLabels)]
        .filter((label) => !expectedClaims.some((claim) => claim.label.includes(label)))
        .map((label) => {
          const foundBeforeIndex = text.lastIndexOf(label, index);
          const foundAfterIndex = text.indexOf(label, endIndex);
          return {
            label,
            distance: Math.min(
              foundBeforeIndex !== -1 && foundBeforeIndex >= clauseStart
                ? index - (foundBeforeIndex + label.length)
                : Number.POSITIVE_INFINITY,
              foundAfterIndex !== -1 && foundAfterIndex < clauseEnd
                ? foundAfterIndex - endIndex
                : Number.POSITIVE_INFINITY,
            ),
          };
        })
        .filter(({ distance }) => distance < nearestExpectedDistance)
        .sort(
          (left, right) => left.distance - right.distance || right.label.length - left.label.length,
        )[0]?.label;
      if (nearerUnexpectedLabel !== undefined) return [`${nearerUnexpectedLabel}=${amount}`];
      const explicitBasis = Array.from(
        text
          .slice(clauseStart + 1, index)
          .matchAll(/(収入|所得|支出|出費|総支出|売上|資産|負債)(?:に対する|に占める|の|比)/gu),
      ).at(-1)?.[1];
      if (
        explicitBasis !== undefined &&
        claimsForLabel.some(({ basisPattern }) => basisPattern !== undefined) &&
        !claimsForLabel.some(
          ({ basisPattern }) =>
            basisPattern !== undefined && new RegExp(basisPattern, "u").test(explicitBasis),
        )
      ) {
        return [`${nearestLabel}=${amount}(分母:${explicitBasis})`];
      }
      const context = collectClaimContext(text, index, endIndex);
      const roleSpecificClaims = claimsForLabel.filter(
        ({ rolePattern }) =>
          rolePattern !== undefined && new RegExp(rolePattern, "u").test(context),
      );
      const hasDirectionalSuffix =
        /^\s*(?:ポイント)?(?:(?:の|から|より)\s*)?(?:増|減|上昇|低下|増加|減少|上が|下が)/u.test(
          text.slice(endIndex, clauseEnd),
        );
      const applicableClaims =
        roleSpecificClaims.length > 0
          ? roleSpecificClaims
          : hasDirectionalSuffix || isPoint
            ? []
            : claimsForLabel.filter(({ rolePattern }) => rolePattern === undefined);
      if (hasNegatedSuffix(text, endIndex, clauseEnd)) {
        return [`${nearestLabel}=${amount}(否定)`];
      }
      return applicableClaims.some((claim) => Math.abs(claim.amount - amount) <= 0.01)
        ? []
        : [`${nearestLabel}=${amount}`];
    },
  );
}

function collectInvalidCategoryComparisons(output: EvaluationOutput): string[] {
  const categoryGroups = output.dataToolResults.flatMap((result) =>
    result.toolName === "getMonthlyCategoryTotals" && Array.isArray(result.output)
      ? [
          result.output.flatMap((row) =>
            typeof row === "object" &&
            row !== null &&
            "category" in row &&
            typeof row.category === "string" &&
            "totalAmount" in row &&
            typeof row.totalAmount === "number"
              ? [{ category: row.category, totalAmount: row.totalAmount }]
              : [],
          ),
        ]
      : [],
  );
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const claims = [output.text, ...collectFacts(output.cards)].flatMap((text) =>
    categoryGroups.flatMap((categoryTotals) =>
      categoryTotals.flatMap((subject) =>
        categoryTotals.flatMap((comparison) => {
          if (subject.category === comparison.category) return [];
          const subjectPattern = escapeRegExp(subject.category);
          const comparisonPattern = escapeRegExp(comparison.category);
          const patterns = [
            new RegExp(
              `${subjectPattern}(?:は|が)${comparisonPattern}(?:より(?:も)?|を)\\s*(多い|少ない|高い|低い|大きい|小さい|上回(?:る|っています|っている|りました)|下回(?:る|っています|っている|りました))`,
              "gu",
            ),
            new RegExp(
              `${comparisonPattern}より(?:も)?${subjectPattern}(?:は|が)?\\s*(多い|少ない|高い|低い|大きい|小さい)`,
              "gu",
            ),
            new RegExp(`${subjectPattern}(?:は|が)${comparisonPattern}(以上|以下)`, "gu"),
            new RegExp(`${comparisonPattern}(以上|以下)(?:なの)?(?:は|が)${subjectPattern}`, "gu"),
          ];
          return patterns.flatMap((pattern) =>
            Array.from(text.matchAll(pattern)).flatMap((match) => {
              const endIndex = match.index + match[0].length;
              if (
                hasNegatedSuffix(
                  text,
                  endIndex,
                  collectClauseBounds(text, match.index, endIndex).clauseEnd,
                )
              ) {
                return [];
              }
              const claimsHigher = /(?:多い|高い|大きい|上回|以上)/u.test(match[1]);
              const includesEquality = /(?:以上|以下)/u.test(match[1]);
              const relationIsValid = claimsHigher
                ? includesEquality
                  ? subject.totalAmount >= comparison.totalAmount
                  : subject.totalAmount > comparison.totalAmount
                : includesEquality
                  ? subject.totalAmount <= comparison.totalAmount
                  : subject.totalAmount < comparison.totalAmount;
              return relationIsValid ? [] : [match[0]];
            }),
          );
        }),
      ),
    ),
  );
  return [...new Set(claims)];
}

export default function assertFinanceResponse(output: string, context: AssertionContext = {}) {
  const parsed = parseOutput(output);
  if (!parsed) return { pass: false, score: 0, reason: "text/cards の評価 JSON が不正です。" };

  const config = context.config ?? {};
  const unexpectedVisibleAmounts = [
    ...collectVisibleAmountMatches(parsed),
    ...collectBareVisibleAmountMatches(parsed, config.visibleAmountClaims ?? []),
  ].filter(
    ({ amount, endIndex, index, text }) =>
      !(config.allowedVisibleAmounts ?? []).some(
        (allowed) =>
          amount === allowed ||
          (isApproximateAmountClaim(text, index, endIndex) &&
            Math.abs(amount - allowed) <= Math.max(10, Math.abs(allowed) * 0.01)),
      ),
  );
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
                (allowedMonth) =>
                  month === allowedMonth ||
                  month === `*-${allowedMonth.slice(5)}` ||
                  month === `year-${allowedMonth.slice(0, 4)}`,
              ) ||
              (month.startsWith("relative-") &&
                config.visibleMonthClaims?.some(
                  ({ rolePattern }) =>
                    rolePattern !== undefined &&
                    new RegExp(rolePattern, "u").test(month.slice("relative-".length)),
                ))
            ),
        );
  const negatedTemporalClaims =
    config.allowedVisibleDates !== undefined || config.allowedVisibleMonths !== undefined
      ? collectNegatedTemporalClaims(parsed)
      : [];
  const mislabeledVisibleMonths = collectMislabeledVisibleMonths(
    parsed,
    config.visibleMonthClaims ?? [],
  );
  const unexpectedVisiblePercentages =
    config.allowedVisiblePercentages === undefined
      ? []
      : collectVisiblePercentageMatches(parsed).filter(
          ({ amount, strength }) =>
            !config.allowedVisiblePercentages?.some(
              (allowed) =>
                (strength === "強" && allowed > amount && allowed - amount <= 1) ||
                (strength === "弱" && allowed < amount && amount - allowed <= 1) ||
                (strength === undefined && Math.abs(allowed - amount) <= 0.01),
            ),
        );
  const mislabeledVisiblePercentages = collectMislabeledVisiblePercentages(
    parsed,
    config.visiblePercentageClaims ?? [],
  );
  const visibleText = [parsed.text, ...collectFacts(parsed.cards)].join("\n").normalize("NFKC");
  const foreignCurrencyClaims = [
    ...visibleText.matchAll(
      /(?:[$€£]\s*[\d]|(?:(?:米|豪|NZ|カナダ|香港|シンガポール|オーストラリア|ニュージーランド)?ドル|ユーロ|ポンド|(?:スイス)?フラン|(?:タイ)?バーツ|(?:インド|パキスタン|スリランカ|ネパール)?ルピー|ペソ|レアル|ランド|ルーブル|リラ|ドン|人民元|中国元|(?:韓国)?ウォン|USD|EUR|GBP|CNY|KRW)\s*(?:で|建て(?:で)?|換算(?:で)?|の)?\s*[、,:：]?\s*(?:約|およそ|概ね|だいたい)?\s*[\d]|[\d][\d,.]*\s*(?:(?:米|豪|NZ|カナダ|香港|シンガポール|オーストラリア|ニュージーランド)?ドル|ユーロ|ポンド|(?:スイス)?フラン|(?:タイ)?バーツ|(?:インド|パキスタン|スリランカ|ネパール)?ルピー|ペソ|レアル|ランド|ルーブル|リラ|ドン|人民元|中国元|(?:韓国)?ウォン|USD|EUR|GBP|CNY|KRW))/gu,
    ),
    ...visibleText.matchAll(
      /(?:[A-Z]{3}\s*(?:で|建て(?:で)?|換算(?:で)?|の)\s*[、,:：]?\s*(?:約|およそ|概ね|だいたい)?\s*[\d](?![\d,.]*\s*(?:銘柄|件|個|口|本|社|回|つ|名|枚|台))|[\d][\d,.]*\s*[A-Z]{3})/gu,
    ),
  ]
    .filter((match) => {
      const endIndex = match.index + match[0].length;
      return !hasNegatedSuffix(
        visibleText,
        endIndex,
        collectClauseBounds(visibleText, match.index, endIndex).clauseEnd,
      );
    })
    .map(([claim]) => claim)
    .filter((claim) => !/JPY/u.test(claim));
  const unsupportedQualitativeDominanceClaims = [
    ...visibleText.matchAll(
      /(?:支出|出費)(?:全体)?の(?:大半|ほとんど|過半数|半分以上)(?:は|が)[\p{L}・]{1,12}?(?=\s*(?:です|である|だ|では|じゃ|でない|。|、|$))/gu,
    ),
    ...visibleText.matchAll(
      /[\p{L}・]{1,12}(?:は|が)(?:支出|出費)(?:全体)?の(?:大半|ほとんど|過半数|半分以上)/gu,
    ),
    ...visibleText.matchAll(
      /(?:支出|出費)(?:で|の(?:うち|中で))?(?:最も|一番)(?:多い|大きい|高い|少ない|小さい|低い)(?:の)?(?:は|が)[\p{L}・]{1,12}?(?=\s*(?:です|である|だ|では|じゃ|でない|。|、|$))/gu,
    ),
    ...visibleText.matchAll(
      /(?:(?:最大|最小)(?:の)?(?:支出|出費)(?:カテゴリ)?|(?:支出|出費)(?:で)?(?:最大|最小)(?:なもの|なの)?)(?:は|が)[\p{L}・]{1,12}?(?=\s*(?:です|である|だ|では|じゃ|でない|。|、|$))/gu,
    ),
    ...visibleText.matchAll(
      /[\p{L}・]{1,12}(?:は|が)(?:支出|出費)(?:で|の(?:うち|中で))?(?:最も|一番)(?:多い|大きい|高い|少ない|小さい|低い)/gu,
    ),
  ]
    .filter((match) => {
      const endIndex = match.index + match[0].length;
      return !hasNegatedSuffix(
        visibleText,
        endIndex,
        collectClauseBounds(visibleText, match.index, endIndex).clauseEnd,
      );
    })
    .map(([claim]) => claim);
  const invalidCategoryComparisons = collectInvalidCategoryComparisons(parsed);
  const unsupportedBareAmountUnits = collectBareVisibleAmountMatches(
    parsed,
    config.visibleAmountClaims ?? [],
  ).flatMap(({ amount, endIndex, text }) => {
    const suffix = /^\s*([\p{L}]+)/u.exec(text.slice(endIndex))?.[1];
    if (
      suffix === undefined ||
      /(?:ではなく|でなく|ではない|でない|じゃない|ではありません|じゃありません)/u.test(suffix) ||
      /^(?:です|でした|である|だ|とな|が|は|に(?:増|減|上昇|低下)|の(?:増|減|上昇|低下)|を(?:上回|下回)|より(?:多|少)|ほど|程度|くらい|ぐらい)/u.test(
        suffix,
      )
    ) {
      return [];
    }
    return [`${amount}${suffix}`];
  });
  const matchedForbiddenVisiblePatterns = (config.forbiddenVisiblePatterns ?? []).filter(
    (pattern) => new RegExp(pattern, "u").test(visibleText),
  );
  const cardFacts = collectFacts(parsed.cards);
  const expectedDataToolFacts = config.expectedDataToolFacts ?? [];
  const textEvidenceMismatch =
    expectedDataToolFacts.length > 0 &&
    (parsed.textEvidence.length === 0 ||
      parsed.textEvidence.map(({ text }) => text).join("") !== parsed.text);
  const missingDataToolFacts = expectedDataToolFacts.filter(
    (expected) => !parsed.dataToolResults.some((result) => dataToolResultMatches(result, expected)),
  );
  const ungroundedTextClaims = (
    expectedDataToolFacts.length === 0 ? [] : parsed.textEvidence
  ).flatMap((evidence) => {
    const evidenceOutput: EvaluationOutput = {
      allowedHrefs: [],
      cards: [],
      dataToolResults: evidence.dataToolResults,
      evidenceShapeValid: true,
      securityEvidenceShapeValid: true,
      text: evidence.text,
      textEvidence: [],
      unauthorizedLinks: [],
    };
    const withLocalTemporalScope = (index: number, endIndex: number) => {
      const selectLocalScope = (collect: (text: string) => string[]) => {
        const allScopes = [...new Set(collect(evidence.text))];
        if (allScopes.length <= 1) return allScopes;

        const precedingScope = collect(evidence.text.slice(0, endIndex)).at(-1);
        const followingScope = collect(evidence.text.slice(index))[0];
        return [precedingScope ?? followingScope].filter(
          (scope): scope is string => scope !== undefined,
        );
      };

      return {
        visibleScopeDates: selectLocalScope((text) =>
          collectDates([text]).filter((date) => /^\d{4}-\d{2}-\d{2}$/u.test(date)),
        ),
        visibleScopeMonths: selectLocalScope((text) =>
          collectVisibleMonths({ ...evidenceOutput, text }).filter((month) =>
            /^\d{4}-\d{2}$/u.test(month),
          ),
        ),
      };
    };
    const amounts = [
      ...collectVisibleAmountMatches(evidenceOutput),
      ...collectBareVisibleAmountMatches(evidenceOutput, config.visibleAmountClaims ?? []),
    ].map(({ amount, endIndex, index, text }) => ({
      claimLabels: [
        collectNearestClaimLabel(text, index, endIndex, config.visibleAmountClaims ?? []),
      ].filter((label): label is string => label !== undefined),
      label: `金額=${amount}`,
      ...withLocalTemporalScope(index, endIndex),
      value: amount,
    }));
    const percentages = collectVisiblePercentageMatches(evidenceOutput).map(
      ({ amount, endIndex, index, text }) => ({
        claimLabels: [
          collectNearestClaimLabel(text, index, endIndex, config.visiblePercentageClaims ?? []),
        ].filter((label): label is string => label !== undefined),
        label: `割合=${amount}`,
        ...withLocalTemporalScope(index, endIndex),
        value: amount,
      }),
    );
    const factSupportsVisibleScope = (
      expected: DataToolFactExpectation,
      visibleScopeMonths: string[],
      visibleScopeDates: string[],
    ) => {
      if (typeof expected.input !== "object" || expected.input === null) return true;
      const input = expected.input as Record<string, unknown>;
      const month = typeof input.month === "string" ? input.month : undefined;
      const date = typeof input.date === "string" ? input.date : undefined;
      const startDate = typeof input.startDate === "string" ? input.startDate : undefined;
      const endDate = typeof input.endDate === "string" ? input.endDate : undefined;
      const hasTemporalScope =
        month !== undefined ||
        date !== undefined ||
        startDate !== undefined ||
        endDate !== undefined;
      if (!hasTemporalScope) return true;
      if (
        visibleScopeDates.length > 0 &&
        !visibleScopeDates.every(
          (visibleDate) =>
            (date !== undefined && visibleDate === date) ||
            (month !== undefined && visibleDate.startsWith(`${month}-`)) ||
            ((startDate !== undefined || endDate !== undefined) &&
              (startDate === undefined || visibleDate >= startDate) &&
              (endDate === undefined || visibleDate <= endDate)),
        )
      ) {
        return false;
      }
      return (
        visibleScopeMonths.length === 0 ||
        visibleScopeMonths.every(
          (visibleMonth) =>
            month === visibleMonth ||
            date?.startsWith(`${visibleMonth}-`) === true ||
            startDate?.startsWith(`${visibleMonth}-`) === true ||
            endDate?.startsWith(`${visibleMonth}-`) === true,
        )
      );
    };
    return [...amounts, ...percentages].flatMap(
      ({ claimLabels, label, value, visibleScopeDates, visibleScopeMonths }) => {
        const numericSupportingFacts = expectedDataToolFacts.filter(
          (expected) =>
            factSupportsVisibleScope(expected, visibleScopeMonths, visibleScopeDates) &&
            collectNumericValues(expected.value).some(
              (expectedValue) =>
                value === expectedValue ||
                Math.abs(value - expectedValue) <= Math.max(0.01, Math.abs(expectedValue) * 0.001),
            ),
        );
        const labelSupportingFacts = numericSupportingFacts.filter((expected) =>
          claimLabels.some((claimLabel) => dataToolFactSupportsLabel(expected, claimLabel)),
        );
        const directSupportingFacts =
          claimLabels.length > 0 ? labelSupportingFacts : numericSupportingFacts;
        const hasDirectEvidence = directSupportingFacts.some((expected) =>
          evidence.dataToolResults.some((result) => dataToolResultMatches(result, expected)),
        );
        const hasDerivedEvidence = (config.derivedVisibleClaims ?? []).some(
          (derivedClaim) =>
            Math.abs(derivedClaim.amount - value) <= 0.01 &&
            derivedClaim.sourceValues.every((sourceValue) =>
              expectedDataToolFacts.some(
                (expected) =>
                  factSupportsVisibleScope(expected, visibleScopeMonths, visibleScopeDates) &&
                  collectNumericValues(expected.value).includes(sourceValue) &&
                  evidence.dataToolResults.some((result) =>
                    dataToolResultMatches(result, expected),
                  ),
              ),
            ),
        );
        const hasEvidence = hasDirectEvidence || hasDerivedEvidence;
        return hasEvidence ? [] : [label];
      },
    );
  });
  const ungroundedTextRoutes = parsed.textEvidence.flatMap((evidence) => {
    const evidenceOutput: EvaluationOutput = {
      allowedHrefs: evidence.allowedHrefs,
      cards: [],
      dataToolResults: evidence.dataToolResults,
      evidenceShapeValid: true,
      securityEvidenceShapeValid: true,
      text: evidence.text,
      textEvidence: [],
      unauthorizedLinks: [],
    };
    return collectRoutes(evidenceOutput).filter((route) => !evidence.allowedHrefs.includes(route));
  });
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
        actual.percentage.toFixed(1) === expected.percentage.toFixed(1),
    );
  const transactionRows = parsed.cards.flatMap((card) =>
    card.type === "transactionList" ? card.transactions : [],
  );
  const retrievedTransactionRows = parsed.dataToolResults.flatMap((result) =>
    result.toolName === "searchTransactions"
      ? collectValuesAtPath(result.output, "$.transactions.*")
      : [],
  );
  const ungroundedTransactionRows = config.requireTransactionToolGrounding
    ? transactionRows.filter(
        (transaction) =>
          !retrievedTransactionRows.some(
            (retrieved) =>
              typeof retrieved === "object" &&
              retrieved !== null &&
              matchesPartial(retrieved, {
                amount: transaction.amount,
                category: transaction.category,
                date: transaction.date,
                description: transaction.description,
                type: transaction.amountType,
              }),
          ),
      )
    : [];
  const collectClaimedTransactionDescriptions = (texts: string[]) =>
    texts
      .flatMap((text) => text.split(/[。！？\n]/u))
      .flatMap((sentence) =>
        Array.from(
          sentence.matchAll(
            /(?:明細|取引)(?:には|に|は)?(?:\d{1,2}月\d{1,2}日の)?(.+?)(?:があります|がありました|が含まれます|が含まれています|を含みます|が記載されています|が載っています)/gu,
          ),
          ([, description]) => description.trim(),
        ),
      );
  const transactionDescriptionIsRetrieved = (description: string, results: DataToolResult[]) =>
    results
      .flatMap((result) =>
        result.toolName === "searchTransactions"
          ? collectValuesAtPath(result.output, "$.transactions.*")
          : [],
      )
      .some(
        (transaction) =>
          typeof transaction === "object" &&
          transaction !== null &&
          "description" in transaction &&
          normalize(String(transaction.description)) === normalize(description),
      );
  const unsupportedTextTransactionDescriptions = config.requireTransactionToolGrounding
    ? [
        ...(parsed.textEvidence.length > 0
          ? parsed.textEvidence
          : [{ text: parsed.text, allowedHrefs: [], dataToolResults: [] }]
        ).flatMap((evidence) =>
          collectClaimedTransactionDescriptions([evidence.text]).filter(
            (description) =>
              !transactionDescriptionIsRetrieved(description, evidence.dataToolResults),
          ),
        ),
        ...collectClaimedTransactionDescriptions(collectFacts(parsed.cards)).filter(
          (description) => !transactionDescriptionIsRetrieved(description, parsed.dataToolResults),
        ),
      ]
    : [];
  const mismatchedTransactionAttributes = config.requireTransactionToolGrounding
    ? [parsed.text, ...collectFacts(parsed.cards)].flatMap((text) =>
        retrievedTransactionRows.flatMap((transaction) => {
          if (
            typeof transaction !== "object" ||
            transaction === null ||
            !("description" in transaction) ||
            typeof transaction.description !== "string"
          ) {
            return [];
          }
          const descriptionPattern = transaction.description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const mismatches: string[] = [];
          for (const match of text.matchAll(
            new RegExp(
              `${descriptionPattern}のカテゴリ(?:は|が)\\s*([^。！？\\n]+?)(?:です|でした|である|だ)(?=[。！？\\n]|$)`,
              "gu",
            ),
          )) {
            if (
              !("category" in transaction) ||
              normalize(String(transaction.category)) !== normalize(match[1])
            ) {
              mismatches.push(`${transaction.description}:カテゴリ=${match[1]}`);
            }
          }
          for (const match of text.matchAll(
            new RegExp(
              `${descriptionPattern}の(?:種別|区分|タイプ)(?:は|が)\\s*(収入|支出|入金|出金|income|expense)(?:です|でした|である|だ)(?=[。！？\\n]|$)`,
              "giu",
            ),
          )) {
            const claimedType = /^(?:収入|入金|income)$/iu.test(match[1]) ? "income" : "expense";
            if (!("type" in transaction) || transaction.type !== claimedType) {
              mismatches.push(`${transaction.description}:種別=${match[1]}`);
            }
          }
          for (const match of text.matchAll(
            new RegExp(
              `${descriptionPattern}の(?:日付|取引日)(?:は|が)\\s*(?:(\\d{4})[-/.年](\\d{1,2})[-/.月](\\d{1,2})日?|(\\d{1,2})月(\\d{1,2})日)(?:です|でした|である|だ)(?=[。！？\\n]|$)`,
              "gu",
            ),
          )) {
            const claimedDate =
              match[1] === undefined
                ? `*-${String(match[4]).padStart(2, "0")}-${String(match[5]).padStart(2, "0")}`
                : `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
            const actualDate = "date" in transaction ? String(transaction.date) : "";
            if (claimedDate !== actualDate && claimedDate !== `*-${actualDate.slice(5)}`) {
              mismatches.push(`${transaction.description}:日付=${claimedDate}`);
            }
          }
          return mismatches;
        }),
      )
    : [];
  const expectedTransactions = config.expectedTransactions ?? [];
  const expectedTransactionGroup = config.expectedTransactionGroup;
  const retrievedGroupTransactionIds =
    expectedTransactionGroup === undefined
      ? []
      : retrievedTransactionRows.flatMap((transaction) =>
          typeof transaction === "object" &&
          transaction !== null &&
          "id" in transaction &&
          (typeof transaction.id === "string" || typeof transaction.id === "number") &&
          "date" in transaction &&
          typeof transaction.date === "string" &&
          transaction.date.startsWith(`${expectedTransactionGroup.month}-`) &&
          "category" in transaction &&
          normalize(String(transaction.category)) ===
            normalize(expectedTransactionGroup.category) &&
          "type" in transaction &&
          transaction.type === expectedTransactionGroup.amountType
            ? [String(transaction.id)]
            : [],
        );
  const retrievedGroupTransactionCount = new Set(retrievedGroupTransactionIds).size;
  const expectedVisibleTransactionCount =
    expectedTransactions.length > 0
      ? expectedTransactions.length
      : expectedTransactionGroup?.expectedCount;
  const visibleTransactionCounts = collectVisibleTransactionCounts(parsed);
  const isNegatedVisibleCount = ({ endIndex, text }: (typeof visibleTransactionCounts)[number]) => {
    const { clauseEnd } = collectClauseBounds(text, endIndex, endIndex);
    return hasNegatedSuffix(text, endIndex, clauseEnd);
  };
  const isExplicitSourceTotal = (visibleCount: (typeof visibleTransactionCounts)[number]) => {
    const { count, endIndex, text } = visibleCount;
    return (
      !isNegatedVisibleCount(visibleCount) &&
      config.allowedVisibleTransactionCounts?.includes(count) === true &&
      (config.requireTransactionToolGrounding !== true ||
        retrievedGroupTransactionCount >= count) &&
      (/^\s*中\s*\d+\s*件/u.test(text.slice(endIndex)) || /^\s*の?うち/u.test(text.slice(endIndex)))
    );
  };
  const unexpectedVisibleTransactionCounts =
    expectedVisibleTransactionCount === undefined
      ? []
      : visibleTransactionCounts.filter((visibleCount) => {
          const { count } = visibleCount;
          if (isNegatedVisibleCount(visibleCount)) return true;
          if (count === expectedVisibleTransactionCount) return false;
          return !isExplicitSourceTotal(visibleCount);
        });
  const truncationDisclosureMissing =
    expectedVisibleTransactionCount !== undefined &&
    config.allowedVisibleTransactionCounts?.some(
      (sourceCount) => sourceCount > expectedVisibleTransactionCount,
    ) === true &&
    (!visibleTransactionCounts.some(
      (visibleCount) =>
        visibleCount.count === expectedVisibleTransactionCount &&
        !isNegatedVisibleCount(visibleCount),
    ) ||
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
      !transactionsMatchExpectedPrefix(
        transactionRows,
        expectedTransactionGroup.allowedTransactions,
      ));
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
    !parsed.securityEvidenceShapeValid ||
    ((expectedDataToolFacts.length > 0 || config.expectedRoute !== undefined) &&
      !parsed.evidenceShapeValid)
      ? "評価証跡フィールドが欠落または不正です。"
      : undefined,
    parsed.unauthorizedLinks.length > 0
      ? `未承認の生成リンク: ${parsed.unauthorizedLinks.join(",")}`
      : undefined,
    textEvidenceMismatch ? "textEvidence が欠落または最終テキストと不一致です。" : undefined,
    unexpectedVisibleAmounts.length > 0
      ? `未許可の可視金額: ${[...new Set(unexpectedVisibleAmounts.map(({ amount }) => amount))].join(",")}`
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
    negatedTemporalClaims.length > 0
      ? `否定された可視日付・月: ${[...new Set(negatedTemporalClaims)].join(",")}`
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
    foreignCurrencyClaims.length > 0
      ? `外貨建ての可視金額: ${[...new Set(foreignCurrencyClaims)].join(",")}`
      : undefined,
    unsupportedQualitativeDominanceClaims.length > 0
      ? `未根拠の定性的支出構成: ${[...new Set(unsupportedQualitativeDominanceClaims)].join(",")}`
      : undefined,
    invalidCategoryComparisons.length > 0
      ? `誤ったカテゴリ間比較: ${invalidCategoryComparisons.join(",")}`
      : undefined,
    unsupportedBareAmountUnits.length > 0
      ? `非金銭単位付き可視金額: ${[...new Set(unsupportedBareAmountUnits)].join(",")}`
      : undefined,
    missingCardFacts.length > 0 ? `不足 card facts: ${missingCardFacts.join(", ")}` : undefined,
    missingDataToolFacts.length > 0
      ? `不足 data tool facts: ${missingDataToolFacts.map(({ toolName, path }) => `${toolName}:${path}`).join(", ")}`
      : undefined,
    ungroundedTextClaims.length > 0
      ? `取得前に主張された可視数値: ${[...new Set(ungroundedTextClaims)].join(",")}`
      : undefined,
    ungroundedTextRoutes.length > 0
      ? `取得前に表示されたroute: ${[...new Set(ungroundedTextRoutes)].join(",")}`
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
    ungroundedTransactionRows.length > 0
      ? `tool未取得の明細: ${ungroundedTransactionRows.map(({ description }) => description).join(", ")}`
      : undefined,
    unsupportedTextTransactionDescriptions.length > 0
      ? `本文中の未取得明細: ${unsupportedTextTransactionDescriptions.join(", ")}`
      : undefined,
    mismatchedTransactionAttributes.length > 0
      ? `誤った明細属性: ${[...new Set(mismatchedTransactionAttributes)].join(", ")}`
      : undefined,
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
