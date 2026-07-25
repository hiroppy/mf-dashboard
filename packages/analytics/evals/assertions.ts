import { z } from "zod";
import { financeChartSchema, type FinanceChart } from "../src/chat/chart";

interface ChartExpectation {
  chartType?: FinanceChart["chartType"];
  data?: Array<{ label: string; values: number[] }>;
  series?: Array<FinanceChart["series"][number]>;
  titleIncludes?: string[];
  unit?: FinanceChart["unit"];
}

interface AssertionContext {
  config?: {
    expectedCharts?: ChartExpectation[];
    expectedMarkdownRows?: string[][];
    expectedTextFacts?: string[];
    expectedTextPairs?: Array<[string, string]>;
    expectedTextLinks?: string[];
    expectedToolRoutes?: string[];
    forbidAmounts?: boolean;
  };
}

interface AssertionResult {
  pass: boolean;
  score: number;
  reason: string;
}

const evaluationOutputSchema = z.object({
  text: z.string(),
  charts: z.array(financeChartSchema),
  toolRoutes: z.array(z.string()),
  textLinks: z.array(z.string()),
});

type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;

function fail(reason: string): AssertionResult {
  return { pass: false, score: 0, reason };
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/[,\s*_`¥￥]/g, "");
}

function includesFact(text: string, fact: string): boolean {
  const normalizedFact = normalizeText(fact);
  if (!/^\d+$/.test(normalizedFact)) return normalizeText(text).includes(normalizedFact);

  return new RegExp(`(?<![\\d.\\-−▲△])${normalizedFact}(?![\\d.])`).test(normalizeText(text));
}

function validateTextPairs(text: string, expectedPairs: Array<[string, string]>): string[] {
  const normalizedText = normalizeText(text);
  const labels = expectedPairs.map(([label]) => normalizeText(label));

  return expectedPairs
    .filter(([, value], pairIndex) => {
      const normalizedLabel = labels[pairIndex]!;
      const labelIndex = normalizedText.indexOf(normalizedLabel);
      if (labelIndex === -1) return true;

      const valueStart = labelIndex + normalizedLabel.length;
      const nextLabelIndex = labels.reduce((nearest, candidate, index) => {
        if (index === pairIndex) return nearest;
        const candidateIndex = normalizedText.indexOf(candidate, valueStart);
        return candidateIndex === -1 ? nearest : Math.min(nearest, candidateIndex);
      }, normalizedText.length);

      return !includesFact(normalizedText.slice(valueStart, nextLabelIndex), value);
    })
    .map(([label, value]) => `${label}=${value}`);
}

function validateChart(actual: FinanceChart, expected: ChartExpectation, index: number): string[] {
  const errors: string[] = [];
  if (expected.chartType && actual.chartType !== expected.chartType) {
    errors.push(`chart ${index + 1} のtypeが${expected.chartType}ではありません`);
  }
  if (expected.unit && actual.unit !== expected.unit) {
    errors.push(`chart ${index + 1} のunitが${expected.unit}ではありません`);
  }
  if (
    expected.titleIncludes &&
    expected.titleIncludes.some((token) => !includesFact(actual.title, token))
  ) {
    errors.push(`chart ${index + 1} のtitleが期待する対象を含みません`);
  }
  if (expected.series && JSON.stringify(actual.series) !== JSON.stringify(expected.series)) {
    errors.push(`chart ${index + 1} のseriesまたは順序が期待値と異なります`);
  }

  if (expected.data && JSON.stringify(actual.data) !== JSON.stringify(expected.data)) {
    errors.push(`chart ${index + 1} のdataまたは順序が期待値と異なります`);
  }
  return errors;
}

function validateMarkdownRows(text: string, expectedRows: string[][]): string[] {
  const normalizeCell = (value: string) => normalizeText(value).replace(/円$/, "");
  const actualRows = text
    .split("\n")
    .filter((line) => line.includes("|"))
    .map((line) =>
      line
        .replace(/^\s*\||\|\s*$/g, "")
        .split("|")
        .map(normalizeCell),
    )
    .filter((row) => row.some((cell) => /^\d{4}-\d{2}-\d{2}$/.test(cell)));
  const normalizedExpectedRows = expectedRows.map((row) => row.map(normalizeCell));
  const sortRows = (rows: string[][]) =>
    [...rows].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  return JSON.stringify(sortRows(actualRows)) === JSON.stringify(sortRows(normalizedExpectedRows))
    ? []
    : expectedRows.map((row) => row.join(" / "));
}

function parseOutput(output: string): EvaluationOutput | undefined {
  try {
    const parsed = evaluationOutputSchema.safeParse(JSON.parse(output));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export default function assertFinanceChatOutput(
  output: string,
  context: AssertionContext,
): AssertionResult {
  const actual = parseOutput(output);
  if (!actual) return fail("出力がfinance chatの評価JSON形式ではありません。");

  const config = context.config ?? {};
  const missingFacts = (config.expectedTextFacts ?? []).filter(
    (fact) => !includesFact(actual.text, fact),
  );
  if (missingFacts.length > 0) {
    return fail(`本文に期待する事実がありません: ${missingFacts.join(", ")}`);
  }
  const missingPairs = validateTextPairs(actual.text, config.expectedTextPairs ?? []);
  if (missingPairs.length > 0) {
    return fail(`本文のラベルと値の組み合わせが期待値と異なります: ${missingPairs.join(", ")}`);
  }
  if (
    config.forbidAmounts &&
    (/[¥￥]\s*\d|\d[\d,.]*\s*(?:円|万\s*円|億\s*円|兆\s*円)/.test(actual.text) ||
      /(?:収入|支出|収支|残高|金額)[^\d\n]{0,8}-?\d[\d,.]*(?![\d年月日件])/.test(actual.text))
  ) {
    return fail("データのない回答に金額が含まれています。");
  }

  const chartExpectations = config.expectedCharts ?? [];
  if (actual.charts.length !== chartExpectations.length) {
    return fail(
      `chart数が期待値と異なります: expected=${chartExpectations.length}, actual=${actual.charts.length}`,
    );
  }
  const chartErrors = chartExpectations.flatMap((expected, index) =>
    validateChart(actual.charts[index]!, expected, index),
  );
  if (chartErrors.length > 0) return fail(chartErrors.join("; "));

  const missingRows = validateMarkdownRows(actual.text, config.expectedMarkdownRows ?? []);
  if (missingRows.length > 0) {
    return fail(`同じMarkdown表行に期待する明細がありません: ${missingRows.join(", ")}`);
  }

  const expectedRoutes = config.expectedToolRoutes ?? [];
  if (JSON.stringify(actual.toolRoutes) !== JSON.stringify(expectedRoutes)) {
    return fail(
      `route tool結果が期待値と異なります: expected=${JSON.stringify(expectedRoutes)}, actual=${JSON.stringify(actual.toolRoutes)}`,
    );
  }

  const expectedLinks = config.expectedTextLinks ?? [];
  if (JSON.stringify(actual.textLinks) !== JSON.stringify(expectedLinks)) {
    return fail(
      `本文linkが期待値と異なります: expected=${JSON.stringify(expectedLinks)}, actual=${JSON.stringify(actual.textLinks)}`,
    );
  }
  const provenRoutes = new Set(actual.toolRoutes);
  const unprovenLinks = actual.textLinks.filter((link) => !provenRoutes.has(link));
  if (unprovenLinks.length > 0) {
    return fail(`route toolに由来しない本文linkがあります: ${unprovenLinks.join(", ")}`);
  }

  return { pass: true, score: 1, reason: "期待するfinance chat出力です。" };
}
