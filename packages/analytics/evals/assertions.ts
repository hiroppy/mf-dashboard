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

interface TextLinkLabelExpectation {
  href: string;
  pattern: string;
}

interface AssertionContext {
  config?: {
    allowOnlyGroundedAmounts?: boolean;
    expectedCharts?: ChartExpectation[];
    expectedDatabaseRows?: string[][];
    expectedDatabaseValues?: string[];
    expectedMarkdownRows?: string[][];
    expectedScopedTextPairs?: ScopedTextPairsExpectation;
    expectedTextFacts?: string[];
    expectedTextLinkLabels?: TextLinkLabelExpectation[];
    expectedTextLinks?: string[];
    expectedTextPairs?: Array<[string, string]>;
    expectedTextPatterns?: string[];
    expectedToolRoutes?: string[];
    forbiddenDatabaseQueryPatterns?: string[];
    forbiddenNoDataQueryPatterns?: string[];
    forbiddenTextTerms?: string[];
    forbidAmounts?: boolean;
    groundPercentagesInCharts?: boolean;
    requiredDatabaseQueryPatterns?: string[];
    requiredNoDataQueryPatterns?: string[];
    requireExactMarkdownRows?: boolean;
    requireNoDataEvidence?: boolean;
    validateChartComparisons?: boolean;
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
  textLinkLabels: z.array(z.object({ href: z.string(), label: z.string() })),
  toolRoutes: z.array(z.string()),
  textLinks: z.array(z.string()),
});

const databaseResultSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
});

const databaseQueryInputSchema = z.object({
  sql: z.string(),
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
      const displayedAmounts = getDisplayedAmounts(segment);
      const hasNegatedValue = new RegExp(
        `${normalizedValue}(?:円)?(?:ではなく|ではありません|でない|じゃない)`,
      ).test(segment);
      const hasValue =
        !hasNegatedValue &&
        (/^\d+$/.test(normalizedValue)
          ? displayedAmounts.length > 0
            ? displayedAmounts.includes(normalizedValue)
            : new RegExp(`(?<![\\d▲△(\\-])${normalizedValue}(?!\\d)`).test(segment)
          : segment.includes(normalizedValue));
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

function matchesDatabaseQuery(
  input: unknown,
  requiredPatterns: string[],
  forbiddenPatterns: string[],
): boolean {
  const query = databaseQueryInputSchema.safeParse(input);
  if (!query.success) return false;

  const executableSql = getExecutableSql(query.data.sql);
  const matches = (pattern: string) => new RegExp(pattern, "i").test(executableSql);
  return requiredPatterns.every(matches) && !forbiddenPatterns.some(matches);
}

function getExecutableSql(sql: string): string {
  let result = "";
  let index = 0;
  let inString = false;

  while (index < sql.length) {
    const character = sql[index]!;
    const next = sql[index + 1];

    if (inString) {
      if (character === "'" && next === "'") {
        result += "__";
        index += 2;
        continue;
      }
      if (character === "'") {
        result += character;
        inString = false;
      } else {
        result += /[\s=<>]/.test(character) ? "_" : character;
      }
      index += 1;
      continue;
    }

    if (character === "-" && next === "-") {
      const lineEnd = sql.indexOf("\n", index + 2);
      index = lineEnd === -1 ? sql.length : lineEnd;
      result += " ";
      continue;
    }
    if (character === "/" && next === "*") {
      const commentEnd = sql.indexOf("*/", index + 2);
      index = commentEnd === -1 ? sql.length : commentEnd + 2;
      result += " ";
      continue;
    }
    if (character === "'") inString = true;
    result += character;
    index += 1;
  }

  return result;
}

function getDatabaseRows(
  queries: Array<{ input: unknown; output: unknown }>,
  requiredPatterns: string[],
  forbiddenPatterns: string[],
): Array<Record<string, unknown>> {
  return queries.flatMap(({ input, output }) => {
    if (!matchesDatabaseQuery(input, requiredPatterns, forbiddenPatterns)) return [];
    const result = databaseResultSchema.safeParse(output);
    return result.success ? result.data.rows : [];
  });
}

function getDisplayedAmounts(text: string): string[] {
  const unitFactor = (unit: string | undefined): number => {
    if (unit?.startsWith("億")) return 100_000_000;
    if (unit?.startsWith("万")) return 10_000;
    if (unit?.startsWith("千")) return 1_000;
    return 1;
  };

  return [
    ...text
      .normalize("NFKC")
      .matchAll(
        /(?:(?:¥\s*)?([▲△+-]?)(\(?)(\d[\d,]*(?:\.\d+)?)\)?\s*((?:億|万|千)?円)|¥\s*([▲△+-]?)(\(?)(\d[\d,]*(?:\.\d+)?)\)?)/g,
      ),
  ]
    .map((match) => {
      const marker = match[1] ?? match[5];
      const openingParenthesis = match[2] ?? match[6];
      const value = match[3] ?? match[7];
      const factor = unitFactor(match[4]);
      const sign =
        marker === "-" || marker === "▲" || marker === "△" || openingParenthesis ? -1 : 1;
      return value ? String(Number(value.replaceAll(",", "")) * factor * sign) : "";
    })
    .filter(Boolean);
}

function getDisplayedPercentages(text: string): number[] {
  return [...text.normalize("NFKC").matchAll(/([+-]?\d[\d,]*(?:\.\d+)?)\s*(?:%|パーセント)/g)].map(
    (match) => Number(match[1]!.replaceAll(",", "")),
  );
}

function getChartPercentages(charts: FinanceChart[]): number[] {
  return charts.flatMap((chart) => {
    if (chart.unit === "percent") return chart.data.flatMap(({ values }) => values);

    return chart.series.flatMap((_, seriesIndex) => {
      const values = chart.data.map(({ values }) => values[seriesIndex] ?? 0);
      const total = values.reduce((sum, value) => sum + value, 0);
      return total === 0 ? [] : values.map((value) => (value / total) * 100);
    });
  });
}

function hasInvalidChartComparison(text: string, charts: FinanceChart[]): boolean {
  const normalizedText = normalize(text);

  return charts.some((chart) => {
    const values = chart.data.map(({ values }) => values[0] ?? 0);
    const maximum = Math.max(...values);
    const minimum = Math.min(...values);

    return chart.data.some(({ label }, index) => {
      const escapedLabel = normalize(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const maximumClaim = new RegExp(
        `${escapedLabel}(?:が|は)(?:(?:最も|一番)(?:多い|大きい|高い)|最多|最大)`,
      ).test(normalizedText);
      const minimumClaim = new RegExp(
        `${escapedLabel}(?:が|は)(?:(?:最も|一番)(?:少ない|小さい|低い)|最少|最小)`,
      ).test(normalizedText);
      return (
        (maximumClaim && values[index] !== maximum) || (minimumClaim && values[index] !== minimum)
      );
    });
  });
}

function encouragesExternalSharing(text: string): boolean {
  return /(?:家計|個人).{0,12}(?:データ|情報).{0,20}(?:外部|第三者).{0,20}(?:共有|送信|アップロード|公開)(?:してください|しましょう|を推奨|をおすすめ)/s.test(
    text,
  );
}

function hasNoDataEvidence(
  queries: Array<{ input: unknown; output: unknown }>,
  requiredPatterns: string[],
  forbiddenPatterns: string[],
): boolean {
  return queries.some(({ input, output }) => {
    const result = databaseResultSchema.safeParse(output);
    if (!result.success || !matchesDatabaseQuery(input, requiredPatterns, forbiddenPatterns)) {
      return false;
    }

    return result.data.rows.length === 0;
  });
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
  if (encouragesExternalSharing(actual.text)) {
    return fail("家計データの外部共有を促す表現があります。");
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

  if (config.forbidAmounts && getDisplayedAmounts(actual.text).length > 0) {
    return fail("データのない回答に金額が含まれています。");
  }

  const expectedDatabaseValues = config.expectedDatabaseValues ?? [];
  const expectedNumericLiteralPatterns = expectedDatabaseValues
    .map(normalize)
    .filter((value) => /^\d+$/.test(value))
    .map((value) => `(?<!\\d)${value}(?!\\d)`);
  const databaseRows = getDatabaseRows(
    actual.databaseQueries,
    config.requiredDatabaseQueryPatterns ?? [],
    [...(config.forbiddenDatabaseQueryPatterns ?? []), ...expectedNumericLiteralPatterns],
  );
  const databaseValues = new Set(
    databaseRows.flatMap((row) => Object.values(row)).map((value) => normalize(String(value))),
  );
  const missingDatabaseValues = expectedDatabaseValues.filter(
    (value) => !databaseValues.has(normalize(value)),
  );
  if (missingDatabaseValues.length > 0) {
    return fail(`DB結果に期待する値がありません: ${missingDatabaseValues.join(", ")}`);
  }
  const missingDatabaseRows = (config.expectedDatabaseRows ?? []).filter((expectedRow) => {
    const expectedValues = expectedRow.map(normalize);
    return !databaseRows.some((row) => {
      const values = Object.values(row).map((value) => normalize(String(value)));
      return expectedValues.every((value) => values.includes(value));
    });
  });
  if (missingDatabaseRows.length > 0) {
    return fail(`DB結果に期待する行がありません: ${missingDatabaseRows.join(", ")}`);
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
    !hasNoDataEvidence(
      actual.databaseQueries,
      config.requiredNoDataQueryPatterns ?? [],
      config.forbiddenNoDataQueryPatterns ?? [],
    )
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
  if (config.groundPercentagesInCharts) {
    const expectedPercentages = getChartPercentages(actual.charts);
    const unsupportedPercentages = getDisplayedPercentages(actual.text).filter(
      (percentage) =>
        !expectedPercentages.some((expected) => Math.abs(expected - percentage) <= 0.51),
    );
    if (unsupportedPercentages.length > 0) {
      return fail(`本文にchartと一致しない割合があります: ${unsupportedPercentages.join(", ")}`);
    }
  }
  if (config.validateChartComparisons && hasInvalidChartComparison(actual.text, actual.charts)) {
    return fail("本文の最大・最小比較がchartと一致しません。");
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
  const invalidLinkLabels = (config.expectedTextLinkLabels ?? []).filter(
    ({ href, pattern }) =>
      !actual.textLinkLabels.some(
        (link) => link.href === href && new RegExp(pattern).test(link.label),
      ),
  );
  if (invalidLinkLabels.length > 0) {
    return fail("本文linkの表示labelが期待と異なります。");
  }

  return { pass: true, reason: "期待するfinance chat出力です。", score: 1 };
}
