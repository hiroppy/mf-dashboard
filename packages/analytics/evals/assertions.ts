import { z } from "zod";
import { financeChartSchema, type FinanceChart } from "../src/chat/chart";
import { removeMarkdownImages } from "./markdown";

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
  /<([a-z][\w-]*)\b(?=[^>]*(?:\shidden(?:\s|=|>)|\saria-hidden\s*=\s*(?:"true"|'true'|true)|\sstyle\s*=\s*(?:"[^"]*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"]*"|'[^']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^']*')))[^>]*>[\s\S]*?<\/\1\s*>/gi;
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
  quot: '"',
  yen: "¥",
};

function fail(reason: string): AssertionResult {
  return { pass: false, reason, score: 0 };
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/[,\s*_`]/g, "");
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
      /&(amp|apos|gt|lt|quot|yen);/gi,
      (_, name: string) => namedCharacterReferences[name.toLocaleLowerCase()]!,
    );
}

function getRenderedText(text: string): string {
  const visibleText = removeMarkdownImages(removeHiddenHtmlElements(text))
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/~~[\s\S]*?~~/g, "")
    .replace(/^\s*\[[^\]]+]:\s*\S+.*$/gm, "");
  return decodeCharacterReferences(visibleText);
}

function removeCode(text: string): string {
  return getRenderableLines(text)
    .join("\n")
    .replace(/`[^`\n]*`/g, "");
}

function hasScopedPair(text: string, label: string, value: string, facts: string[]): boolean {
  if (facts.length === 0) return true;
  if (hasScopedTablePair(text, normalize(label), normalize(value), facts)) return true;
  const normalizedText = normalize(text);
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
      (/(?:約|およそ|概ね|だいたい)$/.test(expectedClaimPrefix) ||
        /^(?:未満|以下|超|以上|程度|前後|約|およそ|くらい|とは限りません|かもしれません|可能性があります|(?:とは?)?断定できません)/.test(
          expectedClaim.suffix.replace(/^[\s、,]*/, ""),
        ));
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
      /[¥￥](マイナス|[-−])?(\d[\d,]*(?:\.\d+)?)(千|万|億|兆)?/g,
      (_, sign: string | undefined, digits: string, scale: string | undefined) =>
        `${sign ?? ""}${digits.replace(/,/g, "")}${scale ?? ""}円`,
    );
}

function getMonetaryClaims(segment: string): number[] {
  const normalizedSegment = normalizeYenPrefix(segment);
  const correctionPattern = /ではなく|でなく|ではない|ではありません|誤り|訂正|実際は|正しくは/g;
  const monetaryPattern = /(マイナス|[-−])?\d+(?:\.\d+)?(?:千|万|億|兆)?円/;
  const corrections = [...normalizedSegment.matchAll(correctionPattern)].filter((match) =>
    monetaryPattern.test(normalizedSegment.slice(match.index! + match[0].length)),
  );
  const lastCorrection = corrections.at(-1);
  const claims =
    lastCorrection?.index === undefined
      ? normalizedSegment
      : normalizedSegment.slice(lastCorrection.index + lastCorrection[0].length);
  return [...claims.matchAll(/(マイナス|[-−])?(\d+(?:\.\d+)?)(千|万|億|兆)?円/g)].map((match) => {
    const sign = match[1] ? -1 : 1;
    return sign * Number(match[2]) * (monetaryScales[match[3] ?? ""] ?? 1);
  });
}

interface MonetaryClaim {
  amount: number;
  index: number;
  suffix: string;
}

function getAssertedMonetaryClaims(text: string): MonetaryClaim[] {
  const normalizedText = normalizeYenPrefix(text.normalize("NFKC")).replace(/,/g, "");
  const monetaryPattern = /(マイナス|[-−])?(\d+(?:\.\d+)?)(千|万|億|兆)?円/g;
  return [...normalizedText.matchAll(monetaryPattern)].flatMap((match) => {
    const suffix = normalizedText.slice(match.index! + match[0].length);
    if (/^\s*(?:ではなく|でなく|ではない|ではありません|じゃない|誤り)/.test(suffix)) {
      return [];
    }
    const sign = match[1] ? -1 : 1;
    return [
      {
        amount: sign * Number(match[2]) * (monetaryScales[match[3] ?? ""] ?? 1),
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
  return [...normalizedText.matchAll(/(-?\d+(?:\.\d+)?)\s*(件|%)/g)].flatMap((match) => {
    const suffix = normalizedText.slice(match.index! + match[0].length);
    if (/^\s*(?:ではなく|でなく|ではない|ではありません|じゃない|誤り)/.test(suffix)) {
      return [];
    }
    return [
      {
        index: match.index!,
        unit: match[2] === "件" ? "count" : "percent",
        value: Number(match[1]),
      },
    ];
  });
}

function getGroundedQuantities(
  databaseQueries: Array<{ input: unknown; output: unknown }>,
): Record<QuantitativeClaim["unit"], Set<number>> {
  const grounded = { count: new Set<number>(), percent: new Set<number>() };
  for (const query of databaseQueries) {
    const result = databaseResultSchema.safeParse(query.output);
    if (!result.success || result.data.truncated) continue;
    for (const row of result.data.rows) {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value !== "number") continue;
        const normalizedKey = normalize(key).toLocaleLowerCase();
        if (/(?:count|件数)/.test(normalizedKey)) grounded.count.add(value);
        if (/(?:percent|percentage|割合|比率)/.test(normalizedKey)) grounded.percent.add(value);
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
  const normalized = normalize(cell).replace(/円$/, "");
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
  let inFence = false;
  return text.split("\n").map((line) => {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      return "";
    }
    return inFence || /^(?: {4}|\t)/.test(line) ? "" : line;
  });
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

function hasTablePair(text: string, label: string, value: string): boolean {
  return getMarkdownTables(text).some((table) => {
    const columnIndex = table.header.indexOf(label);
    return columnIndex !== -1 && table.rows.some((row) => row[columnIndex] === value);
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
        new RegExp(pattern).test(actual.title) && !hasContradictedFact(actual.title, pattern),
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

function hasSuspiciousProjectionLiteral(sql: string): boolean {
  return [...sql.matchAll(/\bselect\b([\s\S]*?)\bfrom\b/gi)].some((select) => {
    const projection = select[1]!;
    return (
      /0x[0-9a-f]+/i.test(projection) ||
      /'\d+(?:\.\d+)?'\s*(?:\|\||[+*/-])/.test(projection) ||
      /\d+(?:\.\d+)?\s*(?:\|\||[+*/-])\s*\d+(?:\.\d+)?/.test(projection) ||
      [...projection.matchAll(/(?<![\w.])(\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?![\w.])/gi)].some(
        (literal) => Number(literal[1]) > 100,
      )
    );
  });
}

function removeSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n\r]*/g, " ");
}

function unquoteSqlIdentifier(identifier: string): string {
  return identifier.slice(1, -1).replaceAll('""', '"');
}

function analyzeSql(sql: string): { literals: string[]; patternText: string } {
  const literals: string[] = [];
  const patternText = removeSqlComments(sql)
    .replace(/'(?:''|[^'])*'/g, (literal) => {
      literals.push(literal.slice(1, -1).replaceAll("''", "'"));
      return " ? ";
    })
    .replace(/"(?:""|[^"])*"/g, unquoteSqlIdentifier);
  return { literals, patternText };
}

function maskSqlForLiteralBinding(sql: string, requiredLiteral: string): string {
  return removeSqlComments(sql)
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
  const lines = getRenderableLines(text);
  const tableLineIndices = new Set<number>();
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
    tableLineIndices.add(index);
    tableLineIndices.add(index + 1);
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const row = getTableCells(lines[rowIndex]!);
      if (!row || row.length !== header.length) break;
      tableLineIndices.add(rowIndex);
    }
  }
  const prose = lines.filter((_, index) => !tableLineIndices.has(index)).join("\n");
  const expectedAmounts = expectedRows
    .flat()
    .map(normalize)
    .filter((cell) => /^\d+$/.test(cell))
    .map(Number);
  const groundedAmounts = new Set([
    ...expectedAmounts,
    expectedAmounts.reduce((sum, value) => sum + value, 0),
  ]);
  return getMonetaryClaims(prose.normalize("NFKC")).some((claim) => !groundedAmounts.has(claim));
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
  const visibleText = [renderedText, ...actual.charts.map((chart) => chart.title)].join("\n");
  const normalizedText = normalize(visibleText);
  const forbiddenTerms = (config.forbiddenTextTerms ?? []).filter((term) =>
    normalizedText.toLocaleLowerCase().includes(normalize(term).toLocaleLowerCase()),
  );
  if (forbiddenTerms.length > 0) {
    return fail(`本文に禁止用語があります: ${forbiddenTerms.join(", ")}`);
  }

  const missingFacts = (config.expectedTextFacts ?? []).filter(
    (fact) => !normalizedText.includes(normalize(fact)) || hasContradictedFact(renderedText, fact),
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
    renderedText,
    config.expectedTextPairs ?? [],
    chartTextPairs,
  );
  const unscopedPairs = (config.expectedTextPairs ?? []).filter(
    ([label, value]) =>
      !hasScopedPair(renderedText, label, value, config.expectedTextPairFacts ?? []),
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
      /(?:食費|収入|支出|収支|金額|合計|総額|残高)[^。！？\n\d]{0,12}(?<!\d)-?\d[\d,.]*(?![\d年月日件%])/.test(
        renderedText.normalize("NFKC"),
      ))
  ) {
    return fail("データのない回答に金額が含まれています。");
  }

  let groundedQuantities: Record<QuantitativeClaim["unit"], Set<number>> = {
    count: new Set(),
    percent: new Set(),
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
      const matchesRequiredSql = requiredSqlPatterns.every((pattern) =>
        pattern.test(sqlAnalysis.patternText),
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
        !hasSuspiciousProjectionLiteral(executableSql)
        ? [{ query, result: parsedResult.data }]
        : [];
    });
    const databaseResults = qualifyingDatabaseQueries.map(({ result }) => result);
    if (databaseResults.length === 0) {
      return fail("期待する事実を裏付けるqueryDatabase結果がありません。");
    }
    if (databaseEvidence.expectNoData) {
      groundedQuantities = getGroundedQuantities(
        qualifyingDatabaseQueries.map(({ query }) => query),
      );
      groundedQuantities.count = new Set(
        [...groundedQuantities.count].filter((value) => value === 0),
      );
      groundedQuantities.percent.clear();
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

  const markdownTables = getMarkdownTables(renderedText);
  const markdownRows = markdownTables.flatMap((table) => table.rows);
  const expectedMarkdownColumns = (config.expectedMarkdownColumns ?? []).map(normalize);
  if (
    config.exactMarkdownRows &&
    (markdownTables.length !== 1 ||
      JSON.stringify(markdownTables[0]?.header) !== JSON.stringify(expectedMarkdownColumns))
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
  const claimText = [removeCode(renderedText), ...actual.charts.map((chart) => chart.title)].join(
    "\n",
  );
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
    const clausePrefix = normalizedClaimText.slice(clauseStart, claim.index);
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
    const hasUnsupportedCoLabel =
      /(?:予算|目標|見込|予測)/.test(bindingPrefix) &&
      !allowedTextPairs.some(
        ([label, amount]) =>
          amount === claim.amount &&
          /(?:予算|目標|見込|予測)/.test(normalize(label)) &&
          bindingPrefix.includes(normalize(label)),
      );
    const isExpectedTableAmount =
      clausePrefix.includes("|") && groundedAmounts.has(claim.amount) && markdownTables.length > 0;
    const isExpectedTableSummary =
      /(?:合計|総額)/.test(bindingPrefix) &&
      groundedAmounts.has(claim.amount) &&
      expectedMarkdownAmounts.length > 0;
    return (
      hasUnsupportedCoLabel ||
      (!hasLabelBinding && !isExpectedTableAmount && !isExpectedTableSummary)
    );
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
    ...new Set([
      ...allowedTextPairs.map(([label]) => normalize(label)),
      "収入",
      "支出",
      "収支",
      "食費",
      "金額",
      "合計",
      "総額",
      "残高",
      "予算",
    ]),
  ]
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const unitlessMonetaryClaims = [
    ...renderedText
      .normalize("NFKC")
      .matchAll(
        new RegExp(
          `(?:^|[。！？\\n、])([^。！？\\n、\\d]{0,12}(?:${monetaryLabelPattern}))[^。！？\\n、\\d]{0,4}(?:は|が|も|:|：)\\s*(-?\\d[\\d,]*)(?![\\d,年月日件%円千万億兆])`,
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
  const normalizedQuantitativeText = claimText.normalize("NFKC").replace(/,/g, "");
  const ungroundedQuantities = getAssertedQuantitativeClaims(claimText).filter((claim) => {
    if (groundedQuantities[claim.unit].has(claim.value)) return false;
    const clauseStart =
      Math.max(
        normalizedQuantitativeText.lastIndexOf("。", claim.index),
        normalizedQuantitativeText.lastIndexOf("！", claim.index),
        normalizedQuantitativeText.lastIndexOf("？", claim.index),
        normalizedQuantitativeText.lastIndexOf("\n", claim.index),
      ) + 1;
    const prefix = normalize(normalizedQuantitativeText.slice(clauseStart, claim.index));
    return !allowedTextPairs.some(
      ([label, value]) => value === claim.value && prefix.includes(normalize(label)),
    );
  });
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
  if (expectedRoutes.some((route) => !actual.toolRoutes.includes(route))) {
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
