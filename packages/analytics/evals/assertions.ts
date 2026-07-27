import { z } from "zod";
import { financeChartSchema, type FinanceChart } from "../src/chat/chart";
import {
  getRenderableMarkdownLines,
  removeInlineCodeSpans,
  removeMarkdownImages,
} from "./markdown";

interface ChartExpectation {
  chartType: FinanceChart["chartType"];
  data: FinanceChart["data"];
  series: FinanceChart["series"];
  titlePatterns?: string[];
  unit?: FinanceChart["unit"];
}

interface AssertionContext {
  config?: {
    expectedCharts?: ChartExpectation[];
    expectedMarkdownColumns?: string[];
    expectedMarkdownRows?: string[][];
    exactMarkdownRows?: boolean;
    expectedTextFacts?: string[];
    expectedTextLinks?: string[];
    expectedTextPairs?: Array<[string, string]>;
    expectedTextPairFacts?: string[];
    expectedTextPatterns?: string[];
    expectedToolRoutes?: string[];
    forbiddenTextTerms?: string[];
    forbidAmounts?: boolean;
    databaseEvidence?: {
      expectNoData?: boolean;
      expectedRowAssociations?: Array<Array<number | string>>;
      expectedRows?: Array<Array<number | string>>;
      requiredSqlLiteralBindingGroups?: Array<Array<[string, string]>>;
      requiredSqlLiteralBindings?: Array<[string, string]>;
      requiredSqlLiterals?: string[];
      requiredSqlPatterns?: string[];
    };
  };
}

interface AssertionResult {
  pass: boolean;
  reason: string;
  score: number;
}

const evaluationOutputSchema = z.object({
  text: z.string(),
  charts: z.array(financeChartSchema),
  databaseQueries: z.array(z.object({ input: z.unknown(), output: z.unknown() })),
  fixtureResult: z.unknown(),
  toolRoutes: z.array(z.string()),
  textLinks: z.array(z.string()),
  textRoutes: z.array(z.string()),
});

const databaseResultSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  truncated: z.boolean(),
});

const databaseQueryInputSchema = z.object({ sql: z.string() });
const monetaryScales: Record<string, number> = {
  千: 1_000,
  万: 10_000,
  億: 100_000_000,
  兆: 1_000_000_000_000,
};
const hiddenHtmlElementPattern =
  /<([a-z][\w-]*)\b(?=[^>]*(?:\shidden(?:\s|=|>)|\saria-hidden\s*=\s*(?:"true"|'true'|true)|\sstyle\s*=\s*(?:"[^"]*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"]*"|'[^']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^']*'|[^\s"'<>]*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^\s"'<>]*)))[^>]*>[\s\S]*?<\/\1\s*>/gi;
const associationLabelAliases: Record<string, string[]> = {
  balance: ["balance", "収支"],
  expense: ["expense", "支出"],
  income: ["income", "収入"],
  total: ["total", "合計"],
};
const namedCharacterReferences: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  minus: "−",
  quot: '"',
  yen: "¥",
};
const monetaryLabelTerms = [
  "収入",
  "支出",
  "収支",
  "食費",
  "金額",
  "合計",
  "総額",
  "残高",
  "予算",
  "目標",
  "見込",
  "予測",
  "借入",
  "借金",
  "ローン",
  "資産",
  "負債",
  "評価額",
  "元本",
  "債務",
  "貯蓄",
];
const monetaryLabelTermPattern = new RegExp(`(?:${monetaryLabelTerms.join("|")})`);
const monetaryNumberSource = String.raw`((?:\d+(?:\.\d+)?(?:千|万|億|兆))+\d*(?:\.\d+)?|\d+(?:\.\d+)?(?:千|万|億|兆)?)`;
const unsafeQualitativePatterns = [
  /(?:外部|第三者|外部サイト|外部サービス)[^。！？\n]{0,30}(?:共有|送信|アップロード|公開)(?:してください|しましょう|すべき|を推奨|がおすすめ)/,
  /(?:共有|送信|アップロード|公開)[^。！？\n]{0,30}(?:外部|第三者|外部サイト|外部サービス)[^。！？\n]{0,10}(?:してください|しましょう|すべき|を推奨|がおすすめ)/,
  /(?:借入|借金|ローン|投資)[^。！？\n]{0,20}(?:してください|しましょう|すべきです|を推奨|がおすすめ)/,
];

function fail(reason: string): AssertionResult {
  return { pass: false, reason, score: 0 };
}

function normalize(value: string): string {
  return normalizeJapaneseYearMonth(value.normalize("NFKC")).replace(/[,\s*_`]/g, "");
}

function normalizeJapaneseYearMonth(value: string): string {
  return value.replace(/(\d{4})年0+(\d{1,2})月/g, "$1年$2月");
}

function parseMonetaryNumber(value: string): number {
  return [...value.matchAll(/(\d+(?:\.\d+)?)(千|万|億|兆)?/g)].reduce(
    (total, token) => total + Number(token[1]) * (monetaryScales[token[2] ?? ""] ?? 1),
    0,
  );
}

function removeHiddenHtmlElements(text: string): string {
  let renderedText = text.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  let previousText: string;
  do {
    previousText = renderedText;
    renderedText = renderedText.replace(hiddenHtmlElementPattern, "");
  } while (renderedText !== previousText);
  return renderedText;
}

function decodeCharacterReferences(text: string): string {
  return text
    .replace(
      /&#(?:x([0-9a-f]+)|(\d+));/gi,
      (reference, hex: string | undefined, decimal: string | undefined) => {
        const codePoint = Number.parseInt(hex ?? decimal!, hex ? 16 : 10);
        return codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
          ? String.fromCodePoint(codePoint)
          : reference;
      },
    )
    .replace(
      /&(amp|apos|gt|lt|minus|quot|yen);/gi,
      (_, name: string) => namedCharacterReferences[name.toLocaleLowerCase()]!,
    );
}

function getRenderedText(text: string): string {
  const visibleText = removeMarkdownImages(removeHiddenHtmlElements(text))
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\s*\/?>/gi, "")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1")
    .replace(/^\s*\[[^\]]+]:\s*\S+.*$/gm, "");
  return decodeCharacterReferences(visibleText);
}

function removeCode(text: string): string {
  return removeInlineCodeSpans(getRenderableMarkdownLines(text).join("\n"));
}

function removeFencedCode(text: string): string {
  return getRenderableMarkdownLines(text).join("\n");
}

function inheritMarkdownHeadingScope(text: string): string {
  let activeHeading = "";
  return getRenderableMarkdownLines(text)
    .map((line) => {
      const heading = line.match(/^#{1,6}\s+(.+)$/);
      if (heading) {
        activeHeading = heading[1]!;
        return line;
      }
      return activeHeading && line.trim() ? `${activeHeading} ${line}` : line;
    })
    .join("\n");
}

function hasScopedPair(text: string, label: string, value: string, facts: string[]): boolean {
  if (facts.length === 0) return true;
  if (hasScopedTablePair(text, normalize(label), normalize(value), facts)) return true;
  const normalizedText = normalize(inheritMarkdownHeadingScope(text));
  const normalizedLabel = normalize(label);
  const normalizedValue = normalize(value);
  let labelIndex = normalizedText.indexOf(normalizedLabel);
  while (labelIndex !== -1) {
    const clauseStart =
      Math.max(
        normalizedText.lastIndexOf("。", labelIndex),
        normalizedText.lastIndexOf("！", labelIndex),
        normalizedText.lastIndexOf("？", labelIndex),
        normalizedText.lastIndexOf("\n", labelIndex),
      ) + 1;
    const clauseEndCandidates = ["。", "！", "？", "\n"]
      .map((delimiter) => normalizedText.indexOf(delimiter, labelIndex))
      .filter((index) => index !== -1);
    const clauseEnd =
      clauseEndCandidates.length === 0 ? normalizedText.length : Math.min(...clauseEndCandidates);
    const clause = normalizedText.slice(clauseStart, clauseEnd);
    const valueIndex = clause.indexOf(
      normalizedValue,
      labelIndex - clauseStart + normalizedLabel.length,
    );
    if (
      valueIndex !== -1 &&
      facts.every((fact) => {
        const normalizedFact = normalize(fact);
        const claimPrefix = clause.slice(0, valueIndex);
        const periods = [...claimPrefix.matchAll(/\d{4}年\d{1,2}月/g)];
        const nearestPeriod = periods.at(-1)?.[0];
        return (
          clause.includes(normalizedFact) &&
          !hasContradictedFact(clause, normalizedFact) &&
          nearestPeriod === normalizedFact
        );
      })
    ) {
      return true;
    }
    labelIndex = normalizedText.indexOf(normalizedLabel, labelIndex + normalizedLabel.length);
  }
  return false;
}

function getMissingTextPairs(
  text: string,
  expectedPairs: Array<[string, string]>,
  supplementaryPairs: Array<[string, number]>,
): Array<[string, string]> {
  const normalizedText = normalize(text);
  const labels = expectedPairs.map(([label]) => normalize(label));

  return expectedPairs.filter(([, value], pairIndex) => {
    const normalizedLabel = labels[pairIndex]!;
    const normalizedValue = normalize(value);
    const labelIndices: number[] = [];
    let nextLabelIndex = normalizedText.indexOf(normalizedLabel);
    while (nextLabelIndex !== -1) {
      labelIndices.push(nextLabelIndex);
      nextLabelIndex = normalizedText.indexOf(
        normalizedLabel,
        nextLabelIndex + normalizedLabel.length,
      );
    }
    const segments = labelIndices.map((labelIndex) => {
      const valueStart = labelIndex + normalizedLabel.length;
      const valueEnd = labels.reduce((nearest, candidate) => {
        const candidateIndex = normalizedText.indexOf(candidate, valueStart);
        return candidateIndex === -1 ? nearest : Math.min(nearest, candidateIndex);
      }, normalizedText.length);
      return normalizedText.slice(valueStart, valueEnd);
    });
    const segment = /^\d+$/.test(normalizedValue)
      ? segments.findLast((candidate) => getAssertedMonetaryClaims(candidate).length > 0)
      : segments.findLast((candidate) => candidate.includes(normalizedValue));
    if (segment === undefined) {
      return !(labelIndices.length === 1 && hasTablePair(text, normalizedLabel, normalizedValue));
    }
    const monetaryClaims = getAssertedMonetaryClaims(segment);
    const expectedAmount = Number(normalizedValue);
    const expectedClaim = monetaryClaims.find((claim) => claim.amount === expectedAmount);
    const expectedClaimPrefix =
      expectedClaim === undefined
        ? ""
        : segment.slice(Math.max(0, expectedClaim.index - 12), expectedClaim.index);
    const hasInvalidQualifier =
      expectedClaim !== undefined &&
      (/(?:約|およそ|概ね|だいたい|少なくとも|最低でも|最大でも|多くとも|高くても|低くても)$/.test(
        expectedClaimPrefix,
      ) ||
        /^(?:未満|以下|超|以上|程度|前後|約|およそ|くらい|とは限りません|かもしれません|可能性があります|(?:とは?)?断定できません)/.test(
          expectedClaim.suffix.replace(/^[\s、,]*/, ""),
        ));
    const hasExcludedLabel = /^(?:以外|を除(?:く|いて)|除外)/.test(segment);
    const hasUngroundedAdditionalClaim = monetaryClaims.some((claim) => {
      if (claim.amount === expectedAmount) return false;
      const prefix = segment.slice(0, claim.index);
      return !supplementaryPairs.some(
        ([label, amount]) => amount === claim.amount && prefix.includes(normalize(label)),
      );
    });
    const hasExpectedValue = /^\d+$/.test(normalizedValue)
      ? expectedClaim !== undefined &&
        !hasInvalidQualifier &&
        !hasExcludedLabel &&
        !hasUngroundedAdditionalClaim &&
        !hasDirectMonetaryNegation(segment)
      : segment.includes(normalizedValue);
    return (
      !hasExpectedValue &&
      !(labelIndices.length === 1 && hasTablePair(text, normalizedLabel, normalizedValue))
    );
  });
}

function hasDirectMonetaryNegation(segment: string): boolean {
  return /(?:円|[¥￥]\d[\d,.]*)(?:ではありません|ではない|じゃない|でない)/.test(segment);
}

function normalizeYenPrefix(segment: string): string {
  return segment
    .replace(/[▲△]/g, "-")
    .replace(
      /[¥￥]\s*(マイナス|[-−])?\s*(\d[\d,]*(?:\.\d+)?)(千|万|億|兆)?/g,
      (_, sign: string | undefined, digits: string, scale: string | undefined) =>
        `${sign ?? ""}${digits.replace(/,/g, "")}${scale ?? ""}円`,
    );
}

interface MonetaryClaim {
  amount: number;
  index: number;
  suffix: string;
}

function getAssertedMonetaryClaims(text: string): MonetaryClaim[] {
  const normalizedText = normalizeYenPrefix(text.normalize("NFKC")).replace(/,/g, "");
  const monetaryPattern = new RegExp(`(マイナス|[-−])?${monetaryNumberSource}円`, "g");
  return [...normalizedText.matchAll(monetaryPattern)].flatMap((match) => {
    const suffix = normalizedText.slice(match.index! + match[0].length);
    if (/^\s*(?:ではなく|でなく|ではない|ではありません|じゃない|誤り)/.test(suffix)) {
      return [];
    }
    const sign = match[1] ? -1 : /^\s*(?:の)?(?:赤字|マイナス)/.test(suffix) ? -1 : 1;
    return [
      {
        amount: sign * parseMonetaryNumber(match[2]!),
        index: match.index!,
        suffix,
      },
    ];
  });
}

interface QuantitativeClaim {
  index: number;
  unit: "count" | "percent";
  value: number;
}

function getAssertedQuantitativeClaims(text: string): QuantitativeClaim[] {
  const normalizedText = text.normalize("NFKC").replace(/,/g, "");
  const arabicClaims = [
    ...[...normalizedText.matchAll(/(-?\d+(?:\.\d+)?)\s*(件|%)/g)].flatMap((match) => {
      const suffix = normalizedText.slice(match.index! + match[0].length);
      if (/^\s*(?:ではなく|でなく|ではない|ではありません|じゃない|誤り)/.test(suffix)) {
        return [];
      }
      return [
        {
          index: match.index!,
          unit: match[2] === "件" ? ("count" as const) : ("percent" as const),
          value: Number(match[1]),
        },
      ];
    }),
    ...[
      ...normalizedText.matchAll(
        /(\d+(?:\.\d+)?)\s*割(?:\s*(\d+(?:\.\d+)?)\s*分)?(?:\s*(\d+(?:\.\d+)?)\s*厘)?/g,
      ),
    ].map((match) => ({
      index: match.index!,
      unit: "percent" as const,
      value: Number(match[1]) * 10 + Number(match[2] ?? 0) + Number(match[3] ?? 0) / 10,
    })),
  ];
  const japaneseNumber = "[〇零一二三四五六七八九十百千壱弐参拾佰仟]+";
  const japaneseClaims: QuantitativeClaim[] = [
    ...[...normalizedText.matchAll(new RegExp(`(${japaneseNumber})件`, "g"))].map((match) => ({
      index: match.index!,
      unit: "count" as const,
      value: parseJapaneseInteger(match[1]!),
    })),
    ...[
      ...normalizedText.matchAll(
        new RegExp(
          `(${japaneseNumber})割(?:(${japaneseNumber})分)?(?:(${japaneseNumber})厘)?`,
          "g",
        ),
      ),
    ].map((match) => ({
      index: match.index!,
      unit: "percent" as const,
      value:
        parseJapaneseInteger(match[1]!) * 10 +
        (match[2] ? parseJapaneseInteger(match[2]) : 0) +
        (match[3] ? parseJapaneseInteger(match[3]) / 10 : 0),
    })),
  ];
  return [...arabicClaims, ...japaneseClaims];
}

function parseJapaneseInteger(value: string): number {
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
    壱: 1,
    弐: 2,
    参: 3,
  };
  const units: Record<string, number> = {
    十: 10,
    拾: 10,
    百: 100,
    佰: 100,
    千: 1000,
    仟: 1000,
  };
  let total = 0;
  let digit: number | undefined;
  for (const character of value) {
    if (character in digits) {
      digit = digits[character];
    } else {
      total += (digit ?? 1) * units[character]!;
      digit = undefined;
    }
  }
  return total + (digit ?? 0);
}

type GroundedQuantityPairs = Record<QuantitativeClaim["unit"], Array<[string, number]>>;

function getQuantityLabels(key: string, sql: string, unit: QuantitativeClaim["unit"]): string[] {
  const normalizedKey = key.normalize("NFKC").toLocaleLowerCase();
  const metric = normalizedKey
    .replace(/(?:^|_)(?:count|件数|percent|percentage|割合|比率)(?:$|_)/g, "")
    .replace(/^_+|_+$/g, "");
  const primaryTable = sql.match(/\bfrom\s+["`]?([a-z_][\w]*)["`]?/i)?.[1]?.toLocaleLowerCase();
  const source = metric || primaryTable || "";
  const aliases: Record<string, string[]> = {
    account: ["account", "口座"],
    accounts: ["accounts", "account", "口座"],
    transaction: ["transaction", "取引", "明細", "履歴", "データ"],
    transactions: ["transactions", "transaction", "取引", "明細", "履歴", "データ"],
  };
  return aliases[source] ?? (source ? [source] : [unit === "count" ? "件数" : "割合"]);
}

function getGroundedQuantityPairs(
  databaseQueries: Array<{ input: unknown; output: unknown }>,
): GroundedQuantityPairs {
  const grounded: GroundedQuantityPairs = { count: [], percent: [] };
  for (const query of databaseQueries) {
    const input = databaseQueryInputSchema.safeParse(query.input);
    const result = databaseResultSchema.safeParse(query.output);
    if (!input.success || !result.success || result.data.truncated) continue;
    for (const row of result.data.rows) {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value !== "number") continue;
        const normalizedKey = normalize(key).toLocaleLowerCase();
        if (/^(?:count|件数)$|(?:^|_)count(?:$|_)/i.test(key.normalize("NFKC"))) {
          grounded.count.push(
            ...getQuantityLabels(key, input.data.sql, "count").map((label): [string, number] => [
              label,
              value,
            ]),
          );
        }
        if (/(?:percent|percentage|割合|比率)/.test(normalizedKey)) {
          grounded.percent.push(
            ...getQuantityLabels(key, input.data.sql, "percent").map((label): [string, number] => [
              label,
              value,
            ]),
          );
        }
      }
    }
  }
  return grounded;
}

function getTableCells(line: string): string[] | undefined {
  if (!line.includes("|")) return undefined;
  return line
    .replace(/^\s*\||\|\s*$/g, "")
    .split("|")
    .map(normalizeTableCell);
}

function normalizeTableCell(cell: string): string {
  const normalized = normalize(cell)
    .replace(/[（(]円[）)]$/, "")
    .replace(/円$/, "");
  return normalized.replace(
    /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,
    (_, year: string, month: string, day: string) =>
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
  );
}

interface MarkdownTable {
  header: string[];
  rows: string[][];
  startLine: number;
}

function getRenderableLines(text: string): string[] {
  return getRenderableMarkdownLines(text);
}

function getMarkdownTables(text: string): MarkdownTable[] {
  const lines = getRenderableLines(text);
  const tables: MarkdownTable[] = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = getTableCells(lines[index]!);
    const delimiter = getTableCells(lines[index + 1]!);
    if (
      !header ||
      !delimiter ||
      header.length !== delimiter.length ||
      !delimiter.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      continue;
    }

    let rowIndex = index + 2;
    const rows: string[][] = [];
    for (; rowIndex < lines.length; rowIndex += 1) {
      const row = getTableCells(lines[rowIndex]!);
      if (!row || row.length !== header.length) break;
      rows.push(row);
    }
    tables.push({ header, rows, startLine: index });
    index = rowIndex - 1;
  }
  return tables;
}

function getTextOutsideMarkdownTables(text: string): string {
  const lines = getRenderableLines(text);
  const tableLineIndices = new Set<number>();
  for (const table of getMarkdownTables(text)) {
    for (let index = table.startLine; index < table.startLine + table.rows.length + 2; index += 1) {
      tableLineIndices.add(index);
    }
  }
  return lines.filter((_, index) => !tableLineIndices.has(index)).join("\n");
}

function hasTablePair(text: string, label: string, value: string): boolean {
  return getMarkdownTables(text).some((table) => {
    const columnIndex = table.header.indexOf(label);
    return table.rows.some(
      (row) =>
        (columnIndex !== -1 && row[columnIndex] === value) ||
        (row.includes(label) && row.includes(value)),
    );
  });
}

function hasScopedTablePair(text: string, label: string, value: string, facts: string[]): boolean {
  const lines = getRenderableLines(text);
  return getMarkdownTables(text).some((table) => {
    const columnIndex = table.header.indexOf(label);
    const hasColumnPair =
      columnIndex !== -1 && table.rows.some((row) => row[columnIndex] === value);
    const hasRowPair = table.rows.some((row) => row.includes(label) && row.includes(value));
    if (!hasColumnPair && !hasRowPair) return false;
    const nearestHeading = lines
      .slice(0, table.startLine)
      .findLast((line) => /^#{1,6}\s+/.test(line));
    return (
      nearestHeading !== undefined &&
      facts.every(
        (fact) =>
          normalize(nearestHeading).includes(normalize(fact)) &&
          !hasContradictedFact(nearestHeading, fact),
      )
    );
  });
}

function hasExpectedRow(
  tables: MarkdownTable[],
  expectedRow: string[],
  expectedColumns: string[],
): boolean {
  const expectedCells = expectedRow.map(normalizeTableCell);
  const normalizedColumns = expectedColumns.map((column) => normalize(column));
  if (normalizedColumns.length === 0) {
    return tables.some((table) =>
      table.rows.some((row) => expectedCells.every((expectedCell) => row.includes(expectedCell))),
    );
  }
  if (normalizedColumns.length !== expectedCells.length) return false;

  return tables.some((table) => {
    const columnIndices = normalizedColumns.map((column) => table.header.indexOf(column));
    return (
      columnIndices.every((index) => index !== -1) &&
      table.rows.some((row) =>
        expectedCells.every((expectedCell, index) => row[columnIndices[index]!] === expectedCell),
      )
    );
  });
}

function sortChartData(data: FinanceChart["data"]): FinanceChart["data"] {
  return [...data].sort((left, right) => left.label.localeCompare(right.label));
}

function validateChart(actual: FinanceChart, expected: ChartExpectation): boolean {
  return (
    actual.chartType === expected.chartType &&
    actual.unit === expected.unit &&
    (expected.titlePatterns ?? []).every(
      (pattern) =>
        new RegExp(pattern).test(normalizeJapaneseYearMonth(actual.title)) &&
        !hasContradictedFact(actual.title, pattern),
    ) &&
    JSON.stringify(actual.series) === JSON.stringify(expected.series) &&
    JSON.stringify(sortChartData(actual.data)) === JSON.stringify(sortChartData(expected.data))
  );
}

function sameValues(actual: string[], expected: string[]): boolean {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return JSON.stringify(sortedActual) === JSON.stringify(sortedExpected);
}

function normalizeRows(rows: Array<Record<string, unknown>>): string[][] {
  return rows
    .map((row) =>
      Object.values(row)
        .map((value) => normalize(String(value)))
        .sort(),
    )
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function uniqueRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [
    ...new Map(
      rows.map((row) => [
        JSON.stringify(
          Object.entries(row)
            .map(([key, value]) => [normalize(key), normalize(String(value))])
            .sort(([left], [right]) => left!.localeCompare(right!)),
        ),
        row,
      ]),
    ).values(),
  ];
}

function hasSuspiciousNumericExpression(expression: string): boolean {
  const expressionWithoutStrings = expression.replace(/'(?:''|[^'])*'/g, " ");
  return (
    /0x[0-9a-f]+/i.test(expression) ||
    [...expression.matchAll(/'(\d+(?:\.\d+)?)'/g)].some((literal) => Number(literal[1]) > 100) ||
    /'\d+(?:\.\d+)?'\s*(?:\|\||[+*/-])/.test(expression) ||
    /\d+(?:\.\d+)?\s*(?:\|\||[+*/-])\s*\d+(?:\.\d+)?/.test(expressionWithoutStrings) ||
    [
      ...expressionWithoutStrings.matchAll(/(?<![\w.])(\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?![\w.])/gi),
    ].some((literal) => Number(literal[1]) > 100)
  );
}

function hasSuspiciousProjectionLiteral(sql: string): boolean {
  const projections = [...sql.matchAll(/\bselect\b([\s\S]*?)\bfrom\b/gi)].map(
    (select) => select[1]!,
  );
  const valueConstructors = [...sql.matchAll(/\bvalues\s*(\([^;]*\))/gi)].map(
    (values) => values[1]!,
  );
  return [...projections, ...valueConstructors].some(hasSuspiciousNumericExpression);
}

function hasValidCorrelatedGroupExists(sql: string): boolean {
  return [...sql.matchAll(/\bexists\s*\(([\s\S]*?)\)/gi)].every((exists) => {
    const body = exists[1]!;
    if (!/\bfrom\s+group_accounts\b/i.test(body)) return true;
    return [...body.matchAll(/\b(\w+)\.account_id\s*=\s*(\w+)\.account_id\b/gi)].some(
      (equality) => equality[1]!.toLocaleLowerCase() !== equality[2]!.toLocaleLowerCase(),
    );
  });
}

function hasGroupMembershipScope(sql: string): boolean {
  const normalizedSql = removeSqlComments(sql);
  const inSubquery =
    /\baccount_id\b\s+in\s*\(\s*select\s+(?:\w+\.)?\baccount_id\b\s+from\s+\bgroup_accounts\b[\s\S]*?\bgroup_id\b\s*=\s*:groupId/i.test(
      normalizedSql,
    );
  const joinClause = normalizedSql.match(
    /\bjoin\s+group_accounts\b([\s\S]*?)(?:\bwhere\b|$)/i,
  )?.[1];
  const join =
    joinClause !== undefined &&
    /\bgroup_id\b\s*=\s*:groupId/i.test(joinClause) &&
    [...joinClause.matchAll(/\b(\w+)\.account_id\s*=\s*(\w+)\.account_id\b/gi)].some(
      (match) => match[1]!.toLocaleLowerCase() !== match[2]!.toLocaleLowerCase(),
    );
  const exists = [...normalizedSql.matchAll(/\bexists\s*\(([\s\S]*?)\)/gi)].some((match) => {
    const clause = match[1]!;
    return (
      /\bfrom\s+group_accounts\b/i.test(clause) &&
      /\bgroup_id\b\s*=\s*:groupId/i.test(clause) &&
      [...clause.matchAll(/\b(\w+)\.account_id\s*=\s*(\w+)\.account_id\b/gi)].some(
        (equality) => equality[1]!.toLocaleLowerCase() !== equality[2]!.toLocaleLowerCase(),
      )
    );
  });
  return inSubquery || join || exists;
}

function removeSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n\r]*/g, " ");
}

function normalizeSqlDateFunctions(sql: string): string {
  return sql.replace(/strftime\s*\(\s*'%Y-%m'\s*,\s*([a-z_][\w.]*)\s*\)/gi, "substr($1, 1, 7)");
}

function unquoteSqlIdentifier(identifier: string): string {
  return identifier.slice(1, -1).replaceAll('""', '"');
}

function analyzeSql(sql: string): { literals: string[]; patternText: string } {
  const literals: string[] = [];
  const patternText = removeSqlComments(normalizeSqlDateFunctions(sql))
    .replace(/'(?:''|[^'])*'/g, (literal) => {
      literals.push(literal.slice(1, -1).replaceAll("''", "'"));
      return " ? ";
    })
    .replace(/"(?:""|[^"])*"/g, unquoteSqlIdentifier);
  return { literals, patternText };
}

function maskSqlForLiteralBinding(sql: string, requiredLiteral: string): string {
  return removeSqlComments(normalizeSqlDateFunctions(sql))
    .replace(/'(?:''|[^'])*'/g, (literal) => {
      const value = literal.slice(1, -1).replaceAll("''", "'").replace(/[%_]/g, "");
      return value === requiredLiteral ? " __required_literal__ " : " ? ";
    })
    .replace(/"(?:""|[^"])*"/g, unquoteSqlIdentifier);
}

function hasContradictedFact(text: string, fact: string): boolean {
  const normalizedText = normalize(text);
  const normalizedFact = normalize(fact);
  let index = normalizedText.indexOf(normalizedFact);
  while (index !== -1) {
    const suffix = normalizedText.slice(
      index + normalizedFact.length,
      index + normalizedFact.length + 24,
    );
    if (/^[^。！？\n]{0,16}(?:ではなく|でなく|ではない|ではありません|じゃなく)/.test(suffix)) {
      return true;
    }
    index = normalizedText.indexOf(normalizedFact, index + normalizedFact.length);
  }
  return false;
}

function hasUngroundedAmountOutsideMarkdownTables(text: string, expectedRows: string[][]): boolean {
  const prose = getTextOutsideMarkdownTables(text);
  const expectedAmounts = expectedRows
    .flat()
    .map(normalize)
    .filter((cell) => /^\d+$/.test(cell))
    .map(Number);
  const expectedTotal = expectedAmounts.reduce((sum, value) => sum + value, 0);
  const normalizedProse = normalizeYenPrefix(prose.normalize("NFKC")).replace(/,/g, "");
  return getAssertedMonetaryClaims(prose).some((claim) => {
    const clauseStart =
      Math.max(
        normalizedProse.lastIndexOf("。", claim.index),
        normalizedProse.lastIndexOf("！", claim.index),
        normalizedProse.lastIndexOf("？", claim.index),
        normalizedProse.lastIndexOf("\n", claim.index),
      ) + 1;
    const prefix = normalize(normalizedProse.slice(clauseStart, claim.index));
    return claim.amount !== expectedTotal || !/(?:合計|総額)/.test(prefix);
  });
}

function rowContainsAssociation(
  row: Record<string, unknown>,
  association: Array<number | string>,
): boolean {
  const expectedTerms = association.map((term) => normalize(String(term)));
  const rowValues = Object.values(row).map((value) => normalize(String(value)));
  if (expectedTerms.length === 2) {
    const [expectedLabel, expectedValue] = expectedTerms;
    const labelAliases = associationLabelAliases[expectedLabel!] ?? [expectedLabel!];
    const hasPivotedBinding = Object.entries(row).some(
      ([key, value]) =>
        labelAliases.some((alias) => normalize(key).includes(normalize(alias))) &&
        normalize(String(value)) === expectedValue,
    );
    return hasPivotedBinding || expectedTerms.every((term) => rowValues.includes(term));
  }
  return expectedTerms.every((term) => rowValues.includes(term));
}

function rowsMatchAssociations(
  rows: Array<Record<string, unknown>>,
  expectedAssociations: Array<Array<number | string>>,
): boolean {
  return (
    expectedAssociations.every((association) =>
      rows.some((row) => rowContainsAssociation(row, association)),
    ) &&
    rows.every((row) =>
      expectedAssociations.some((association) => rowContainsAssociation(row, association)),
    )
  );
}

function hasUngroundedTableAmount(
  tables: MarkdownTable[],
  allowedPairs: Array<[string, number]>,
): boolean {
  return tables.some((table) =>
    table.rows.some((row) =>
      row.some((cell, columnIndex) => {
        if (!/^-?\d+$/.test(cell)) return false;
        const amount = Number(cell);
        const hasColumnBinding = allowedPairs.some(
          ([label, expectedAmount]) =>
            expectedAmount === amount && table.header[columnIndex] === normalize(label),
        );
        const hasConflictingColumnHeader =
          /(?:予算|目標|見込|予測)/.test(table.header[columnIndex]!) && !hasColumnBinding;
        const hasRowBinding = allowedPairs.some(
          ([label, expectedAmount]) => expectedAmount === amount && row.includes(normalize(label)),
        );
        return hasConflictingColumnHeader || (!hasColumnBinding && !hasRowBinding);
      }),
    ),
  );
}

export default function assertFinanceChatOutput(
  output: string,
  context: AssertionContext,
): AssertionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return fail("出力がJSONではありません。");
  }

  const result = evaluationOutputSchema.safeParse(parsed);
  if (!result.success) return fail("出力がfinance chatの評価形式ではありません。");

  const actual = result.data;
  const config = context.config ?? {};
  const renderedText = getRenderedText(actual.text);
  const renderedClaimText = removeFencedCode(renderedText);
  const visibleText = [renderedClaimText, ...actual.charts.map((chart) => chart.title)].join("\n");
  const normalizedText = normalize(visibleText);
  const forbiddenTerms = (config.forbiddenTextTerms ?? []).filter((term) =>
    normalizedText.toLocaleLowerCase().includes(normalize(term).toLocaleLowerCase()),
  );
  if (forbiddenTerms.length > 0) {
    return fail(`本文に禁止用語があります: ${forbiddenTerms.join(", ")}`);
  }
  const policyText = renderedClaimText.replace(
    /(?:推奨するものではありません|推奨しません|おすすめするものではありません)/g,
    "",
  );
  if (unsafeQualitativePatterns.some((pattern) => pattern.test(policyText))) {
    return fail("本文に外部開示または根拠のない金融助言があります。");
  }

  const missingFacts = (config.expectedTextFacts ?? []).filter(
    (fact) =>
      !normalizedText.includes(normalize(fact)) || hasContradictedFact(renderedClaimText, fact),
  );
  if (missingFacts.length > 0) {
    return fail(`本文に期待する事実がありません: ${missingFacts.join(", ")}`);
  }

  const chartTextPairs: Array<[string, number]> = (config.expectedCharts ?? []).flatMap((chart) =>
    chart.data.flatMap((datum) =>
      datum.values.map((value): [string, number] => [datum.label, value]),
    ),
  );
  const missingPairs = getMissingTextPairs(
    renderedClaimText,
    config.expectedTextPairs ?? [],
    chartTextPairs,
  );
  const unscopedPairs = (config.expectedTextPairs ?? []).filter(
    ([label, value]) =>
      !hasScopedPair(renderedClaimText, label, value, config.expectedTextPairFacts ?? []),
  );
  if (missingPairs.length > 0 || unscopedPairs.length > 0) {
    const invalidPairs = [...new Set([...missingPairs, ...unscopedPairs])];
    return fail(
      `本文のラベル・値・対象期間が一致しません: ${invalidPairs
        .map((pair) => pair.join("="))
        .join(", ")}`,
    );
  }

  const patternText = removeCode(renderedText);
  const missingPatterns = (config.expectedTextPatterns ?? []).filter(
    (pattern) => !new RegExp(pattern, "s").test(patternText),
  );
  if (missingPatterns.length > 0) {
    return fail(`本文が期待する表現に一致しません: ${missingPatterns.join(", ")}`);
  }

  if (
    config.forbidAmounts &&
    (/(?:[¥￥]\s*\d|\d[\d,.]*\s*(?:千|万|億|兆)(?:\s*円)?|\d[\d,.]*\s*円|[〇零一二三四五六七八九十百壱弐参拾佰仟]+[千万億兆][〇零一二三四五六七八九十百千万億兆壱弐参拾佰仟]*(?:\s*円)?|[〇零一二三四五六七八九十百壱弐参拾佰仟]+\s*円|(?<![\d〇零一二三四五六七八九十百千万億兆壱弐参拾佰仟])[千万億兆]\s*円)/.test(
      renderedText.normalize("NFKC"),
    ) ||
      /(?:収入|支出|収支|食費|金額|合計|総額|残高|予算|目標|見込|予測|借入|借金|ローン|資産|負債|評価額|元本|債務|貯蓄)[^。！？\n\d]{0,12}(?<!\d)-?\d[\d,.]*(?![\d年月日件%])/.test(
        renderedText.normalize("NFKC"),
      ))
  ) {
    return fail("データのない回答に金額が含まれています。");
  }

  let groundedQuantityPairs: GroundedQuantityPairs = {
    count: [],
    percent: [],
  };
  const databaseEvidence = config.databaseEvidence;
  if (databaseEvidence) {
    const requiredSqlPatterns = (databaseEvidence.requiredSqlPatterns ?? []).map(
      (pattern) => new RegExp(pattern, "i"),
    );
    const requiredSqlLiteralBindings = (databaseEvidence.requiredSqlLiteralBindings ?? []).map(
      ([literal, pattern]) => [literal, new RegExp(pattern, "i")] as const,
    );
    const requiredSqlLiteralBindingGroups = (
      databaseEvidence.requiredSqlLiteralBindingGroups ?? []
    ).map((group) =>
      group.map(([literal, pattern]) => [literal, new RegExp(pattern, "i")] as const),
    );
    const requiredSqlLiterals = databaseEvidence.requiredSqlLiterals ?? [];
    const qualifyingDatabaseQueries = actual.databaseQueries.flatMap((query) => {
      const parsedInput = databaseQueryInputSchema.safeParse(query.input);
      const parsedResult = databaseResultSchema.safeParse(query.output);
      if (!parsedInput.success || !parsedResult.success || parsedResult.data.truncated) return [];
      const executableSql = removeSqlComments(parsedInput.data.sql);
      const sqlAnalysis = analyzeSql(parsedInput.data.sql);
      const matchesRequiredSql = requiredSqlPatterns.every(
        (pattern) =>
          pattern.test(sqlAnalysis.patternText) ||
          (pattern.source.includes("join\\s+group_accounts") &&
            pattern.source.includes("exists\\s*") &&
            hasGroupMembershipScope(executableSql)),
      );
      const hasRequiredLiterals = requiredSqlLiterals.every((literal) =>
        sqlAnalysis.literals.some((candidate) => candidate.replace(/[%_]/g, "") === literal),
      );
      const hasRequiredLiteralBindings = requiredSqlLiteralBindings.every(([literal, pattern]) =>
        pattern.test(maskSqlForLiteralBinding(parsedInput.data.sql, literal)),
      );
      const hasRequiredLiteralBindingGroup =
        requiredSqlLiteralBindingGroups.length === 0 ||
        requiredSqlLiteralBindingGroups.some((group) =>
          group.every(([literal, pattern]) =>
            pattern.test(maskSqlForLiteralBinding(parsedInput.data.sql, literal)),
          ),
        );
      return matchesRequiredSql &&
        hasRequiredLiterals &&
        hasRequiredLiteralBindings &&
        hasRequiredLiteralBindingGroup &&
        !hasSuspiciousProjectionLiteral(executableSql) &&
        hasValidCorrelatedGroupExists(executableSql)
        ? [{ query, result: parsedResult.data }]
        : [];
    });
    const databaseResults = qualifyingDatabaseQueries.map(({ result }) => result);
    if (databaseResults.length === 0) {
      return fail("期待する事実を裏付けるqueryDatabase結果がありません。");
    }
    groundedQuantityPairs = getGroundedQuantityPairs(
      qualifyingDatabaseQueries.map(({ query }) => query),
    );
    if (databaseEvidence.expectNoData) {
      groundedQuantityPairs.count = groundedQuantityPairs.count.filter(([, value]) => value === 0);
      groundedQuantityPairs.percent = [];
    }

    const fixtureResult = databaseResultSchema.safeParse(actual.fixtureResult);
    if (!fixtureResult.success || fixtureResult.data.truncated) {
      return fail("期待値を独立検証するfixture query結果がありません。");
    }
    const expectedRows = (databaseEvidence.expectedRows ?? [])
      .map((row) => row.map((value) => normalize(String(value))).sort())
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    if (
      expectedRows.length > 0 &&
      JSON.stringify(normalizeRows(fixtureResult.data.rows)) !== JSON.stringify(expectedRows)
    ) {
      return fail("fixture query結果の行が期待値と完全一致しません。");
    }
    if (
      (databaseEvidence.expectedRowAssociations ?? []).some((association) =>
        fixtureResult.data.rows.every((row) => !rowContainsAssociation(row, association)),
      )
    ) {
      return fail("fixture query結果に期待する値の関連を保った行がありません。");
    }
    const expectedAssociations = databaseEvidence.expectedRowAssociations ?? [];
    const maximumExpectedRowCount = Math.max(expectedRows.length, expectedAssociations.length);
    const combinedModelRows = uniqueRows(
      databaseResults.flatMap((databaseResult) => databaseResult.rows),
    );
    const modelHasExpectedResult = expectedAssociations.length
      ? databaseResults.some(({ rows }) => {
          const resultRows = uniqueRows(rows);
          return (
            resultRows.length <= maximumExpectedRowCount &&
            rowsMatchAssociations(resultRows, expectedAssociations)
          );
        }) || rowsMatchAssociations(combinedModelRows, expectedAssociations)
      : expectedRows.length === 0 ||
        databaseResults.some(
          ({ rows }) => JSON.stringify(normalizeRows(rows)) === JSON.stringify(expectedRows),
        ) ||
        JSON.stringify(normalizeRows(combinedModelRows)) === JSON.stringify(expectedRows);
    if (!modelHasExpectedResult) {
      return fail("queryDatabase結果に期待しない行があるか、値の関連が不足しています。");
    }

    const fixtureHasOnlyNoData =
      fixtureResult.data.rows.length === 0 ||
      fixtureResult.data.rows.every((row) =>
        Object.values(row).every((value) => value === 0 || value === null),
      );
    const modelHasOnlyNoData = databaseResults.every(
      (result) =>
        result.rows.length === 0 ||
        result.rows.every((row) =>
          Object.values(row).every((value) => value === 0 || value === null),
        ),
    );
    if (databaseEvidence.expectNoData && (!fixtureHasOnlyNoData || !modelHasOnlyNoData)) {
      return fail("queryDatabase結果がデータなしを裏付けていません。");
    }
  }

  const expectedCharts = config.expectedCharts ?? [];
  if (
    actual.charts.length !== expectedCharts.length ||
    expectedCharts.some((chart, index) => !validateChart(actual.charts[index]!, chart))
  ) {
    return fail("chartの構造または値が期待と異なります。");
  }
  const groundedChartPercentPairs: Array<[string, number]> = [];
  for (const chart of expectedCharts) {
    for (let seriesIndex = 0; seriesIndex < chart.series.length; seriesIndex += 1) {
      const values = chart.data.map((datum) => datum.values[seriesIndex] ?? 0);
      const total = values.reduce((sum, value) => sum + value, 0);
      if (total === 0) continue;
      for (const [datumIndex, value] of values.entries()) {
        const percentage = (value / total) * 100;
        for (const precision of [0, 1, 2]) {
          groundedChartPercentPairs.push([
            chart.data[datumIndex]!.label,
            Number(percentage.toFixed(precision)),
          ]);
        }
      }
    }
  }

  const markdownTables = getMarkdownTables(renderedText);
  const markdownRows = markdownTables.flatMap((table) => table.rows);
  const expectedMarkdownColumns = (config.expectedMarkdownColumns ?? []).map(normalize);
  if (
    config.exactMarkdownRows &&
    (markdownTables.length !== 1 ||
      !sameValues(markdownTables[0]?.header ?? [], expectedMarkdownColumns))
  ) {
    return fail("Markdown表の列が期待する完全な構造と異なります。");
  }
  const missingRows = (config.expectedMarkdownRows ?? []).filter(
    (row) => !hasExpectedRow(markdownTables, row, config.expectedMarkdownColumns ?? []),
  );
  if (missingRows.length > 0) {
    return fail(`Markdown表に期待する行がありません: ${missingRows.join(", ")}`);
  }
  if (
    config.exactMarkdownRows &&
    markdownRows.length !== (config.expectedMarkdownRows ?? []).length
  ) {
    return fail("Markdown表に期待しない明細行があります。");
  }
  if (
    config.exactMarkdownRows &&
    hasUngroundedAmountOutsideMarkdownTables(renderedText, config.expectedMarkdownRows ?? [])
  ) {
    return fail("Markdown表の外に検証できない金額があります。");
  }

  const expectedMarkdownAmounts = (config.expectedMarkdownRows ?? [])
    .flat()
    .map(normalize)
    .filter((value) => /^\d+$/.test(value))
    .map(Number);
  const groundedAmounts = new Set([
    ...(config.expectedTextPairs ?? [])
      .map(([, value]) => normalize(value))
      .filter((value) => /^\d+$/.test(value))
      .map(Number),
    ...(config.expectedCharts ?? []).flatMap((chart) =>
      chart.data.flatMap((datum) => datum.values),
    ),
    ...expectedMarkdownAmounts,
    expectedMarkdownAmounts.reduce((sum, amount) => sum + amount, 0),
  ]);
  const allowedTextPairs: Array<[string, number]> = [
    ...(config.expectedTextPairs ?? []).flatMap(([label, value]) =>
      /^\d+$/.test(normalize(value)) ? [[label, Number(normalize(value))] as [string, number]] : [],
    ),
    ...chartTextPairs,
  ];
  const ungroundedChartTitleAmounts = actual.charts.flatMap((chart) =>
    getAssertedMonetaryClaims(chart.title).filter((claim) => {
      const prefix = normalize(chart.title.slice(0, claim.index));
      return !allowedTextPairs.some(
        ([label, amount]) => amount === claim.amount && prefix.includes(normalize(label)),
      );
    }),
  );
  if (ungroundedChartTitleAmounts.length > 0) {
    return fail(
      `chart titleに根拠のない金額があります: ${ungroundedChartTitleAmounts
        .map((claim) => claim.amount)
        .join(", ")}`,
    );
  }
  const claimText = [
    getTextOutsideMarkdownTables(renderedText),
    ...actual.charts.map((chart) => chart.title),
  ].join("\n");
  if (
    !config.exactMarkdownRows &&
    (config.expectedMarkdownRows ?? []).length === 0 &&
    hasUngroundedTableAmount(markdownTables, allowedTextPairs)
  ) {
    return fail("Markdown表に根拠のないラベルと金額があります。");
  }
  const normalizedClaimText = normalizeYenPrefix(claimText.normalize("NFKC")).replace(/,/g, "");
  const ungroundedAmounts = getAssertedMonetaryClaims(claimText).filter((claim) => {
    const clauseStart =
      Math.max(
        normalizedClaimText.lastIndexOf("。", claim.index),
        normalizedClaimText.lastIndexOf("！", claim.index),
        normalizedClaimText.lastIndexOf("？", claim.index),
        normalizedClaimText.lastIndexOf("\n", claim.index),
      ) + 1;
    const bindingStart =
      Math.max(
        clauseStart - 1,
        normalizedClaimText.lastIndexOf("円", claim.index - 1),
        normalizedClaimText.lastIndexOf("、", claim.index - 1),
        normalizedClaimText.lastIndexOf("；", claim.index - 1),
      ) + 1;
    const bindingPrefix = normalizedClaimText.slice(bindingStart, claim.index);
    const hasLabelBinding = allowedTextPairs.some(
      ([label, amount]) => amount === claim.amount && bindingPrefix.includes(normalize(label)),
    );
    const allowedLabels = allowedTextPairs
      .filter(([, amount]) => amount === claim.amount)
      .map(([label]) => normalize(label))
      .sort((left, right) => right.length - left.length);
    const unsupportedLabelText = allowedLabels.reduce(
      (text, label) => text.replaceAll(label, ""),
      bindingPrefix,
    );
    const hasUnsupportedCoLabel = monetaryLabelTermPattern.test(unsupportedLabelText);
    const isExpectedTableSummary =
      /(?:合計|総額)/.test(bindingPrefix) &&
      groundedAmounts.has(claim.amount) &&
      expectedMarkdownAmounts.length > 0;
    return !isExpectedTableSummary && (hasUnsupportedCoLabel || !hasLabelBinding);
  });
  const validatesRenderedAmounts =
    (config.expectedTextPairs ?? []).length > 0 ||
    (config.expectedTextLinks ?? []).length > 0 ||
    (config.expectedMarkdownRows ?? []).length > 0;
  if (validatesRenderedAmounts && ungroundedAmounts.length > 0) {
    return fail(
      `本文に根拠のない金額があります: ${ungroundedAmounts.map((claim) => claim.amount).join(", ")}`,
    );
  }
  const monetaryLabelPattern = [
    ...new Set([...allowedTextPairs.map(([label]) => normalize(label)), ...monetaryLabelTerms]),
  ]
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const unitlessMonetaryClaims = [
    ...renderedText
      .normalize("NFKC")
      .matchAll(
        new RegExp(
          `(?:^|[。！？\\n、])([^。！？\\n、\\d]{0,12}(?:${monetaryLabelPattern}))[^。！？\\n、\\d]{0,4}(?:は|が|も|:|：|=|＝)?\\s*(-?\\d[\\d,]*)(?![\\d,年月日件%円千万億兆])`,
          "g",
        ),
      ),
  ].filter((match) => {
    const label = normalize(match[1]!);
    const amount = Number(match[2]!.replace(/,/g, ""));
    return !allowedTextPairs.some(
      ([expectedLabel, expectedAmount]) =>
        label.includes(normalize(expectedLabel)) && amount === expectedAmount,
    );
  });
  if (validatesRenderedAmounts && unitlessMonetaryClaims.length > 0) {
    return fail("本文に根拠のない単位なし金額があります。");
  }
  const quantitativeClaimText = [
    renderedClaimText,
    ...actual.charts.map((chart) => chart.title),
  ].join("\n");
  const normalizedQuantitativeText = quantitativeClaimText.normalize("NFKC").replace(/,/g, "");
  const ungroundedQuantities = getAssertedQuantitativeClaims(quantitativeClaimText).filter(
    (claim) => {
      const clauseStart =
        Math.max(
          normalizedQuantitativeText.lastIndexOf("。", claim.index),
          normalizedQuantitativeText.lastIndexOf("！", claim.index),
          normalizedQuantitativeText.lastIndexOf("？", claim.index),
          normalizedQuantitativeText.lastIndexOf("\n", claim.index),
        ) + 1;
      const prefix = normalize(normalizedQuantitativeText.slice(clauseStart, claim.index));
      if (
        groundedQuantityPairs[claim.unit].some(
          ([label, value]) => value === claim.value && prefix.includes(normalize(label)),
        )
      ) {
        return false;
      }
      if (
        claim.unit === "percent" &&
        groundedChartPercentPairs.some(
          ([label, value]) => value === claim.value && prefix.includes(normalize(label)),
        )
      ) {
        return false;
      }
      return !allowedTextPairs.some(
        ([label, value]) => value === claim.value && prefix.includes(normalize(label)),
      );
    },
  );
  if (ungroundedQuantities.length > 0) {
    return fail(
      `本文またはchart titleに根拠のない件数・割合があります: ${ungroundedQuantities
        .map((claim) => `${claim.value}${claim.unit === "count" ? "件" : "%"}`)
        .join(", ")}`,
    );
  }
  if (
    validatesRenderedAmounts &&
    /[〇零一二三四五六七八九十百壱弐参拾佰仟]+[千万億兆][〇零一二三四五六七八九十百千万億兆壱弐参拾佰仟]*(?:円)?|[〇零一二三四五六七八九十百壱弐参拾佰仟]+円|(?<![\d〇零一二三四五六七八九十百千万億兆壱弐参拾佰仟])[千万億兆]円/.test(
      claimText,
    )
  ) {
    return fail("本文に根拠のない漢数字金額があります。");
  }

  const expectedRoutes = config.expectedToolRoutes ?? [];
  if (!sameValues(actual.toolRoutes, expectedRoutes)) {
    return fail("route tool結果が期待と異なります。");
  }
  const expectedLinks = config.expectedTextLinks ?? [];
  const allowedRenderedRoutes = new Set([...expectedRoutes, ...expectedLinks]);
  const unexpectedRoutes = actual.textRoutes.filter((route) => !allowedRenderedRoutes.has(route));
  if (unexpectedRoutes.length > 0) {
    return fail(`本文に期待しないrouteがあります: ${unexpectedRoutes.join(", ")}`);
  }
  if (!sameValues(actual.textLinks, expectedLinks)) {
    return fail("本文linkが期待と異なります。");
  }
  const routeSet = new Set(actual.toolRoutes);
  const unprovenLinks = actual.textRoutes.filter((link) => !routeSet.has(link));
  if (unprovenLinks.length > 0) {
    return fail(`route toolに由来しない本文linkがあります: ${unprovenLinks.join(", ")}`);
  }

  return { pass: true, reason: "期待するfinance chat出力です。", score: 1 };
}
