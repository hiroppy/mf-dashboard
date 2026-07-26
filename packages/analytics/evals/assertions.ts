import { z } from "zod";
import { financeChartSchema, type FinanceChart } from "../src/chat/chart";

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
    expectedTextPatterns?: string[];
    expectedToolRoutes?: string[];
    forbiddenTextTerms?: string[];
    forbidAmounts?: boolean;
    databaseEvidence?: {
      expectNoData?: boolean;
      expectedRowAssociations?: Array<Array<number | string>>;
      expectedRows?: Array<Array<number | string>>;
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

function fail(reason: string): AssertionResult {
  return { pass: false, reason, score: 0 };
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/[,\s*_`]/g, "");
}

function getMissingTextPairs(
  text: string,
  expectedPairs: Array<[string, string]>,
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
      ? segments.findLast((candidate) => getMonetaryClaims(candidate).length > 0)
      : segments.findLast((candidate) => candidate.includes(normalizedValue));
    if (segment === undefined) {
      return !(labelIndices.length === 1 && hasTablePair(text, normalizedLabel, normalizedValue));
    }
    const monetaryClaims = getMonetaryClaims(segment);
    const hasExpectedValue = /^\d+$/.test(normalizedValue)
      ? monetaryClaims.length === 1 &&
        monetaryClaims[0] === Number(normalizedValue) &&
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
  return segment.replace(/[¥￥](マイナス|[-−])?(\d+(?:\.\d+)?)(千|万|億|兆)?/g, "$1$2$3円");
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

function getAssertedMonetaryClaims(text: string): number[] {
  const normalizedText = normalizeYenPrefix(text.normalize("NFKC")).replace(/,/g, "");
  const monetaryPattern = /(マイナス|[-−])?(\d+(?:\.\d+)?)(千|万|億|兆)?円/g;
  return [...normalizedText.matchAll(monetaryPattern)].flatMap((match) => {
    const suffix = normalizedText.slice(match.index! + match[0].length);
    if (/^\s*(?:ではなく|でなく|ではない|ではありません|じゃない|誤り)/.test(suffix)) {
      return [];
    }
    const sign = match[1] ? -1 : 1;
    return [sign * Number(match[2]) * (monetaryScales[match[3] ?? ""] ?? 1)];
  });
}

function getTableCells(line: string): string[] | undefined {
  if (!line.includes("|")) return undefined;
  return line
    .replace(/^\s*\||\|\s*$/g, "")
    .split("|")
    .map((cell) => normalize(cell).replace(/円$/, ""));
}

interface MarkdownTable {
  header: string[];
  rows: string[][];
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
    tables.push({ header, rows });
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

function hasExpectedRow(
  tables: MarkdownTable[],
  expectedRow: string[],
  expectedColumns: string[],
): boolean {
  const expectedCells = expectedRow.map((cell) => normalize(cell).replace(/円$/, ""));
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
    (expected.titlePatterns ?? []).every((pattern) => new RegExp(pattern).test(actual.title)) &&
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

function hasSuspiciousProjectionLiteral(sql: string): boolean {
  const projection = sql.match(/\bselect\b([\s\S]*?)\bfrom\b/i)?.[1] ?? "";
  return [...projection.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g)].some(
    (match) => !["0", "1"].includes(match[1]!),
  );
}

function hasContradictedFact(text: string, fact: string): boolean {
  const normalizedText = normalize(text);
  const normalizedFact = normalize(fact);
  const index = normalizedText.lastIndexOf(normalizedFact);
  if (index === -1) return false;
  const suffix = normalizedText.slice(
    index + normalizedFact.length,
    index + normalizedFact.length + 24,
  );
  return /^[^。！？\n]{0,16}(?:ではなく|でなく|ではない|ではありません|じゃなく)/.test(suffix);
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
  const rowTerms = [
    ...Object.keys(row).map(normalize),
    ...Object.values(row).map((value) => normalize(String(value))),
  ];
  return association.every((term) => rowTerms.includes(normalize(String(term))));
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
  const normalizedText = normalize(actual.text);
  const forbiddenTerms = (config.forbiddenTextTerms ?? []).filter((term) =>
    normalizedText.toLocaleLowerCase().includes(normalize(term).toLocaleLowerCase()),
  );
  if (forbiddenTerms.length > 0) {
    return fail(`本文に禁止用語があります: ${forbiddenTerms.join(", ")}`);
  }

  const missingFacts = (config.expectedTextFacts ?? []).filter(
    (fact) => !normalizedText.includes(normalize(fact)) || hasContradictedFact(actual.text, fact),
  );
  if (missingFacts.length > 0) {
    return fail(`本文に期待する事実がありません: ${missingFacts.join(", ")}`);
  }

  const missingPairs = getMissingTextPairs(actual.text, config.expectedTextPairs ?? []);
  if (missingPairs.length > 0) {
    return fail(
      `本文のラベルと値が一致しません: ${missingPairs.map((pair) => pair.join("=")).join(", ")}`,
    );
  }

  const missingPatterns = (config.expectedTextPatterns ?? []).filter(
    (pattern) => !new RegExp(pattern, "s").test(actual.text),
  );
  if (missingPatterns.length > 0) {
    return fail(`本文が期待する表現に一致しません: ${missingPatterns.join(", ")}`);
  }

  if (
    config.forbidAmounts &&
    (/(?:[¥￥]\s*\d|\d[\d,.]*\s*(?:千|万|億|兆)(?:\s*円)?|\d[\d,.]*\s*円|[〇零一二三四五六七八九十百千万億兆壱弐参拾佰仟]*[千万億兆][〇零一二三四五六七八九十百千万億兆壱弐参拾佰仟]*(?:\s*円)?|[〇零一二三四五六七八九十百壱弐参拾佰仟]+\s*円)/.test(
      actual.text.normalize("NFKC"),
    ) ||
      /(?:食費|収入|支出|収支|金額|合計|総額|残高)[^。！？\n\d]{0,12}(?<!\d)-?\d[\d,.]*(?![\d年月日件%])/.test(
        actual.text.normalize("NFKC"),
      ))
  ) {
    return fail("データのない回答に金額が含まれています。");
  }

  const databaseEvidence = config.databaseEvidence;
  if (databaseEvidence) {
    const requiredSqlPatterns = (databaseEvidence.requiredSqlPatterns ?? []).map(
      (pattern) => new RegExp(pattern, "i"),
    );
    const databaseResults = actual.databaseQueries.flatMap((query) => {
      const parsedInput = databaseQueryInputSchema.safeParse(query.input);
      const parsedResult = databaseResultSchema.safeParse(query.output);
      if (!parsedInput.success || !parsedResult.success || parsedResult.data.truncated) return [];
      const matchesRequiredSql = requiredSqlPatterns.every((pattern) =>
        pattern.test(parsedInput.data.sql),
      );
      return matchesRequiredSql && !hasSuspiciousProjectionLiteral(parsedInput.data.sql)
        ? [parsedResult.data]
        : [];
    });
    if (databaseResults.length === 0) {
      return fail("期待する事実を裏付けるqueryDatabase結果がありません。");
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
      expectedRows.length > 0 &&
      (databaseEvidence.expectedRowAssociations ?? []).some((association) =>
        databaseResults.every((databaseResult) =>
          databaseResult.rows.every((row) => !rowContainsAssociation(row, association)),
        ),
      )
    ) {
      return fail("queryDatabase結果に期待する値の関連を保った行がありません。");
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

  const markdownTables = getMarkdownTables(actual.text);
  const markdownRows = markdownTables.flatMap((table) => table.rows);
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
    hasUngroundedAmountOutsideMarkdownTables(actual.text, config.expectedMarkdownRows ?? [])
  ) {
    return fail("Markdown表の外に検証できない金額があります。");
  }

  const groundedAmounts = new Set([
    ...(config.expectedTextPairs ?? [])
      .map(([, value]) => normalize(value))
      .filter((value) => /^\d+$/.test(value))
      .map(Number),
    ...(config.expectedCharts ?? []).flatMap((chart) =>
      chart.data.flatMap((datum) => datum.values),
    ),
    ...(config.expectedMarkdownRows ?? [])
      .flat()
      .map(normalize)
      .filter((value) => /^\d+$/.test(value))
      .map(Number),
  ]);
  const ungroundedAmounts = getAssertedMonetaryClaims(actual.text).filter(
    (amount) => !groundedAmounts.has(amount),
  );
  if ((config.expectedTextPairs ?? []).length > 0 && ungroundedAmounts.length > 0) {
    return fail(`本文に根拠のない金額があります: ${ungroundedAmounts.join(", ")}`);
  }

  const expectedRoutes = config.expectedToolRoutes ?? [];
  if (!sameValues(actual.toolRoutes, expectedRoutes)) {
    return fail("route tool結果が期待と異なります。");
  }
  const expectedLinks = config.expectedTextLinks ?? [];
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
