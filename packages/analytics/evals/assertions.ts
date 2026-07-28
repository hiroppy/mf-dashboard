import { z } from "zod";
import { financeChartSchema, type FinanceChart } from "../src/chat/chart";

interface ChartExpectation {
  chartType: FinanceChart["chartType"];
  data: FinanceChart["data"];
  series: FinanceChart["series"];
  title?: string;
  unit?: FinanceChart["unit"];
}

interface ScopedTextPairsExpectation {
  pairs: Array<[string, string]>;
  scopeFact: string;
}

interface AssertionContext {
  config?: {
    allowOnlyGroundedAmounts?: boolean;
    expectedCharts?: ChartExpectation[];
    expectedDatabaseValues?: string[];
    expectedMarkdownRows?: string[][];
    expectedScopedTextPairs?: ScopedTextPairsExpectation;
    expectedTextFacts?: string[];
    expectedTextLinks?: string[];
    expectedTextPairs?: Array<[string, string]>;
    expectedTextPatterns?: string[];
    expectedToolRoutes?: string[];
    forbiddenTextTerms?: string[];
    forbidAmounts?: boolean;
    requireExactMarkdownRows?: boolean;
    requireNoDataEvidence?: boolean;
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
  toolRoutes: z.array(z.string()),
  textLinks: z.array(z.string()),
});

const databaseResultSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
});

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
    let labelIndex = normalizedText.indexOf(normalizedLabel);

    while (labelIndex !== -1) {
      const valueStart = labelIndex + normalizedLabel.length;
      const valueEnd = labels.reduce((nearest, candidate) => {
        const candidateIndex = normalizedText.indexOf(candidate, valueStart);
        return candidateIndex === -1 ? nearest : Math.min(nearest, candidateIndex);
      }, normalizedText.length);
      const segment = normalizedText.slice(valueStart, valueEnd);
      const hasValue = /^\d+$/.test(normalizedValue)
        ? new RegExp(`(?<!\\d)${normalizedValue}(?!\\d)`).test(segment)
        : segment.includes(normalizedValue);
      if (hasValue) return false;

      labelIndex = normalizedText.indexOf(normalizedLabel, valueStart);
    }

    return true;
  });
}

function getTextScopes(text: string, fact: string): string[] {
  const normalizedFact = normalize(fact);
  const lines = text.split("\n");
  const scopes: string[] = [];

  for (const [index, line] of lines.entries()) {
    if (!normalize(line).includes(normalizedFact)) continue;

    if (/^\s{0,3}#{1,6}\s/.test(line)) {
      const nextHeading = lines.findIndex(
        (candidate, candidateIndex) => candidateIndex > index && /^\s{0,3}#{1,6}\s/.test(candidate),
      );
      scopes.push(lines.slice(index, nextHeading === -1 ? undefined : nextHeading).join("\n"));
      continue;
    }

    scopes.push(
      ...line.split(/[。！？]/).filter((clause) => normalize(clause).includes(normalizedFact)),
    );
  }

  return scopes;
}

function parseMarkdownRow(line: string): string[] | null {
  if (!line.includes("|")) return null;

  return line
    .replace(/^\s*\||\|\s*$/g, "")
    .split("|")
    .map((cell) => normalize(cell).replace(/円$/, ""));
}

function getMarkdownBodyRows(text: string): string[][] {
  const lines = text.split("\n");
  const rows: string[][] = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = parseMarkdownRow(lines[index]!);
    const separator = parseMarkdownRow(lines[index + 1]!);
    if (
      !header ||
      !separator ||
      header.length !== separator.length ||
      !separator.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      continue;
    }

    let bodyIndex = index + 2;
    while (bodyIndex < lines.length) {
      const row = parseMarkdownRow(lines[bodyIndex]!);
      if (!row || row.length !== header.length) break;
      rows.push(row);
      bodyIndex += 1;
    }
    index = bodyIndex - 1;
  }

  return rows;
}

function hasExpectedRow(
  actualRows: string[][],
  expectedRow: string[],
  requireExactMatch: boolean,
): boolean {
  const expectedCells = expectedRow.map((cell) => normalize(cell).replace(/円$/, ""));
  return actualRows.some((row) => {
    if (requireExactMatch) return JSON.stringify(row) === JSON.stringify(expectedCells);
    return expectedCells.every((expectedCell) => row.includes(expectedCell));
  });
}

function sortChartData(data: FinanceChart["data"]): FinanceChart["data"] {
  return [...data].sort((left, right) => left.label.localeCompare(right.label));
}

function validateChart(actual: FinanceChart, expected: ChartExpectation): boolean {
  return (
    actual.chartType === expected.chartType &&
    (expected.title === undefined || actual.title === expected.title) &&
    actual.unit === expected.unit &&
    JSON.stringify(actual.series) === JSON.stringify(expected.series) &&
    JSON.stringify(sortChartData(actual.data)) === JSON.stringify(sortChartData(expected.data))
  );
}

function sameValues(actual: string[], expected: string[]): boolean {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return JSON.stringify(sortedActual) === JSON.stringify(sortedExpected);
}

function getDatabaseRows(queries: Array<{ output: unknown }>): Array<Record<string, unknown>> {
  return queries.flatMap(({ output }) => {
    const result = databaseResultSchema.safeParse(output);
    return result.success ? result.data.rows : [];
  });
}

function getDisplayedAmounts(text: string): string[] {
  return [
    ...text
      .normalize("NFKC")
      .matchAll(/(?:¥\s*(-?\d[\d,]*(?:\.\d+)?)|(-?\d[\d,]*(?:\.\d+)?)\s*円)/g),
  ]
    .map((match) => normalize(match[1] ?? match[2] ?? ""))
    .filter(Boolean);
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
    (fact) => !normalizedText.includes(normalize(fact)),
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

  const scopedPairs = config.expectedScopedTextPairs;
  if (
    scopedPairs &&
    !getTextScopes(actual.text, scopedPairs.scopeFact).some(
      (scope) => getMissingTextPairs(scope, scopedPairs.pairs).length === 0,
    )
  ) {
    return fail(`本文の${scopedPairs.scopeFact}と期待する値が同じ範囲にありません。`);
  }

  const missingPatterns = (config.expectedTextPatterns ?? []).filter(
    (pattern) => !new RegExp(pattern, "s").test(actual.text),
  );
  if (missingPatterns.length > 0) {
    return fail(`本文が期待する表現に一致しません: ${missingPatterns.join(", ")}`);
  }

  if (config.forbidAmounts && /(?:[¥￥]\s*\d|\d[\d,.]*\s*円)/.test(actual.text.normalize("NFKC"))) {
    return fail("データのない回答に金額が含まれています。");
  }

  const databaseRows = getDatabaseRows(actual.databaseQueries);
  const databaseValues = new Set(
    databaseRows.flatMap((row) => Object.values(row)).map((value) => normalize(String(value))),
  );
  const missingDatabaseValues = (config.expectedDatabaseValues ?? []).filter(
    (value) => !databaseValues.has(normalize(value)),
  );
  if (missingDatabaseValues.length > 0) {
    return fail(`DB結果に期待する値がありません: ${missingDatabaseValues.join(", ")}`);
  }
  if (config.allowOnlyGroundedAmounts) {
    const allowedAmounts = new Set([
      ...(config.expectedDatabaseValues ?? []).map(normalize),
      ...(config.expectedTextPairs ?? []).map(([, value]) => normalize(value)),
    ]);
    const unexpectedAmounts = getDisplayedAmounts(actual.text).filter(
      (amount) => !allowedAmounts.has(amount),
    );
    if (unexpectedAmounts.length > 0) {
      return fail(`本文に根拠のない金額があります: ${[...new Set(unexpectedAmounts)].join(", ")}`);
    }
  }
  if (
    config.requireNoDataEvidence &&
    !actual.databaseQueries.some(({ output }) => {
      const result = databaseResultSchema.safeParse(output);
      return (
        result.success &&
        (result.data.rows.length === 0 ||
          result.data.rows.every((row) => Object.values(row).every((value) => value === null)))
      );
    })
  ) {
    return fail("データなし回答を裏付けるDB結果がありません。");
  }

  const expectedCharts = config.expectedCharts ?? [];
  if (
    actual.charts.length !== expectedCharts.length ||
    expectedCharts.some((chart, index) => !validateChart(actual.charts[index]!, chart))
  ) {
    return fail("chartの構造または値が期待と異なります。");
  }

  const markdownRows = getMarkdownBodyRows(actual.text);
  const expectedMarkdownRows = config.expectedMarkdownRows ?? [];
  const missingRows = expectedMarkdownRows.filter(
    (row) => !hasExpectedRow(markdownRows, row, config.requireExactMarkdownRows ?? false),
  );
  if (missingRows.length > 0) {
    return fail(`Markdown表に期待する行がありません: ${missingRows.join(", ")}`);
  }
  if (config.requireExactMarkdownRows && markdownRows.length !== expectedMarkdownRows.length) {
    return fail("Markdown表に想定外の明細行があります。");
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
  const unprovenLinks = actual.textLinks.filter((link) => !routeSet.has(link));
  if (unprovenLinks.length > 0) {
    return fail(`route toolに由来しない本文linkがあります: ${unprovenLinks.join(", ")}`);
  }

  return { pass: true, reason: "期待するfinance chat出力です。", score: 1 };
}
