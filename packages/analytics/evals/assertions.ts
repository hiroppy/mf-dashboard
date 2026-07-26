import { z } from "zod";
import { financeChartSchema, type FinanceChart } from "../src/chat/chart";

interface ChartExpectation {
  chartType: FinanceChart["chartType"];
  data: FinanceChart["data"];
  series: FinanceChart["series"];
  unit?: FinanceChart["unit"];
}

interface AssertionContext {
  config?: {
    expectedCharts?: ChartExpectation[];
    expectedMarkdownRows?: string[][];
    expectedTextFacts?: string[];
    expectedTextLinks?: string[];
    expectedTextPairs?: Array<[string, string]>;
    expectedTextPatterns?: string[];
    expectedToolRoutes?: string[];
    forbiddenTextTerms?: string[];
    forbidAmounts?: boolean;
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
  toolRoutes: z.array(z.string()),
  textLinks: z.array(z.string()),
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
      const hasExpectedValue = /^\d+$/.test(normalizedValue)
        ? new RegExp(`(?<!\\d)${normalizedValue}(?!\\d)`).test(segment)
        : segment.includes(normalizedValue);
      if (hasExpectedValue) return false;

      labelIndex = normalizedText.indexOf(normalizedLabel, valueStart);
    }
    return true;
  });
}

function getTableCells(line: string): string[] | undefined {
  if (!line.includes("|")) return undefined;
  return line
    .replace(/^\s*\||\|\s*$/g, "")
    .split("|")
    .map((cell) => normalize(cell).replace(/円$/, ""));
}

function getMarkdownRows(text: string): string[][] {
  const lines = text.split("\n");
  const rows: string[][] = [];

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

    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const row = getTableCells(lines[rowIndex]!);
      if (!row) break;
      if (row.length === header.length) rows.push(row);
    }
  }
  return rows;
}

function hasExpectedRow(actualRows: string[][], expectedRow: string[]): boolean {
  const expectedCells = expectedRow.map((cell) => normalize(cell).replace(/円$/, ""));
  return actualRows.some((row) =>
    expectedCells.every((expectedCell) => row.includes(expectedCell)),
  );
}

function sortChartData(data: FinanceChart["data"]): FinanceChart["data"] {
  return [...data].sort((left, right) => left.label.localeCompare(right.label));
}

function validateChart(actual: FinanceChart, expected: ChartExpectation): boolean {
  return (
    actual.chartType === expected.chartType &&
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

  const missingPatterns = (config.expectedTextPatterns ?? []).filter(
    (pattern) => !new RegExp(pattern, "s").test(actual.text),
  );
  if (missingPatterns.length > 0) {
    return fail(`本文が期待する表現に一致しません: ${missingPatterns.join(", ")}`);
  }

  if (
    config.forbidAmounts &&
    (/(?:[¥￥]\s*\d|\d[\d,.]*\s*(?:千|万|億|兆)?\s*円)/.test(actual.text.normalize("NFKC")) ||
      /(?:食費|収入|支出|収支|金額|合計|総額|残高)[^。！？\n\d]{0,12}(?<!\d)-?\d[\d,.]*(?![\d年月日件%])/.test(
        actual.text.normalize("NFKC"),
      ))
  ) {
    return fail("データのない回答に金額が含まれています。");
  }

  const expectedCharts = config.expectedCharts ?? [];
  if (
    actual.charts.length !== expectedCharts.length ||
    expectedCharts.some((chart, index) => !validateChart(actual.charts[index]!, chart))
  ) {
    return fail("chartの構造または値が期待と異なります。");
  }

  const markdownRows = getMarkdownRows(actual.text);
  const missingRows = (config.expectedMarkdownRows ?? []).filter(
    (row) => !hasExpectedRow(markdownRows, row),
  );
  if (missingRows.length > 0) {
    return fail(`Markdown表に期待する行がありません: ${missingRows.join(", ")}`);
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
