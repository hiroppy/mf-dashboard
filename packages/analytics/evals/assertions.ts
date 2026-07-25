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
    databaseQuery?: {
      expectEmpty?: boolean;
      expectedRowCount?: number;
      forbiddenSqlPatterns?: string[];
      outputCells?: Array<{ columnPattern: string; value: string }>;
      outputRows?: string[][];
      outputSqlPatterns?: string[];
      predicatePatterns?: string[];
      sqlPatterns: string[];
    };
    expectedCharts?: ChartExpectation[];
    expectedMarkdownRows?: string[][];
    expectedRenderedLinks?: string[];
    expectedTextFacts?: string[];
    expectedTextPairs?: Array<[string, string]>;
    expectedTextPatterns?: string[];
    expectedTextLinks?: string[];
    expectedToolRoutes?: string[];
    forbiddenTextTerms?: string[];
    forbidAmounts?: boolean;
    textPairBoundaries?: string[];
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
  renderedLinks: z.array(z.string()),
  toolTrace: z.array(
    z.object({
      input: z.unknown(),
      output: z.unknown().optional(),
      succeeded: z.boolean(),
      toolName: z.string(),
    }),
  ),
  toolRoutes: z.array(z.string()),
  textLinks: z.array(z.string()),
});

type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;

const databaseResultSchema = z.object({
  columns: z.array(z.string()),
  rowCount: z.number().int().nonnegative(),
  rows: z.array(z.record(z.string(), z.unknown())),
  truncated: z.boolean(),
});

type DatabaseResult = z.infer<typeof databaseResultSchema>;

function fail(reason: string): AssertionResult {
  return { pass: false, score: 0, reason };
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/[,\s*_`]/g, "");
}

function includesFact(text: string, fact: string): boolean {
  const normalizedFact = normalizeText(fact);
  if (!/^\d+$/.test(normalizedFact)) return normalizeText(text).includes(normalizedFact);

  return new RegExp(`(?<![\\d.\\-−▲△])${normalizedFact}(?![\\d.])`).test(normalizeText(text));
}

function validateTextPairs(
  text: string,
  expectedPairs: Array<[string, string]>,
  boundaries: string[],
): string[] {
  const normalizedText = normalizeText(text);
  const expectedLabels = expectedPairs.map(([label]) => normalizeText(label));
  const labels = [...expectedLabels, ...boundaries.map(normalizeText)];

  return expectedPairs
    .filter(([, value], pairIndex) => {
      const normalizedLabel = expectedLabels[pairIndex]!;
      const segments: string[] = [];
      let labelIndex = normalizedText.indexOf(normalizedLabel);
      while (labelIndex !== -1) {
        const valueStart = labelIndex + normalizedLabel.length;
        const nextLabelIndex = labels.reduce((nearest, candidate) => {
          const candidateIndex = normalizedText.indexOf(candidate, valueStart);
          return candidateIndex === -1 ? nearest : Math.min(nearest, candidateIndex);
        }, normalizedText.length);
        segments.push(normalizedText.slice(valueStart, nextLabelIndex));
        labelIndex = normalizedText.indexOf(normalizedLabel, valueStart);
      }

      const expectedValue = Number(value);
      const directClaims = segments.flatMap((segment) => {
        const explicitBreakdownIndex = segment.search(/内訳(?:は|:|：)?/);
        const parenthesisIndex = segment.search(/[（(]/);
        const parentheticalText =
          parenthesisIndex === -1 ? "" : segment.slice(parenthesisIndex + 1).split(/[）)]/, 1)[0]!;
        const parentheticalAmounts = [
          ...parentheticalText.matchAll(/\d+(?:\.\d+)?(?:万|億|兆)?円/g),
        ];
        const parentheticalBreakdownIndex =
          parenthesisIndex !== -1 &&
          /\d(?:万|億|兆)?円/.test(segment.slice(0, parenthesisIndex)) &&
          parentheticalAmounts.length >= 2 &&
          !/(?:正しくは|訂正|ではなく|誤り|実際は)/.test(parentheticalText)
            ? parenthesisIndex
            : -1;
        const claimEnd = [explicitBreakdownIndex, parentheticalBreakdownIndex]
          .filter((index) => index !== -1)
          .reduce((earliest, index) => Math.min(earliest, index), segment.length);
        const claimSegment = segment
          .slice(0, claimEnd)
          .replace(
            /(\d+(?:\.\d+)?)万(\d+(?:\.\d+)?)円/g,
            (_, high, low) => `${Number(high) * 10_000 + Number(low)}円`,
          )
          .replace(/[¥￥]((?:[-−▲△]|マイナス)?)(\d+(?:\.\d+)?)(万|億|兆)?/g, "$1$2$3円");
        const amounts = [
          ...claimSegment.matchAll(/((?:[-−▲△]|マイナス)?)(\d+(?:\.\d+)?)(万|億|兆)?円/g),
        ].map((match) => {
          const matchIndex = match.index ?? 0;
          const before = claimSegment.slice(Math.max(0, matchIndex - 8), matchIndex);
          const after = claimSegment.slice(
            matchIndex + match[0].length,
            matchIndex + match[0].length + 8,
          );
          const semanticNegative =
            /(?:赤字|損失)[^。！？\n\d]{0,4}$/.test(before) ||
            /^[^。！？\n\d]{0,3}(?:赤字|損失)/.test(after);
          const sign = match[1] || semanticNegative ? -1 : 1;
          const scale = { 万: 10_000, 億: 100_000_000, 兆: 1_000_000_000_000 }[match[3] ?? ""] ?? 1;
          return sign * Number(match[2]) * scale;
        });
        if (amounts.length === 0) return [];

        return [
          {
            amounts,
            negated: new RegExp(
              String.raw`\d(?:万|億|兆)?円[^。！？\n]{0,12}(?:ではなく|でなく|ではない|ではありません|未満|を(?:超え|下回)|より(?:少な|多))`,
            ).test(claimSegment),
          },
        ];
      });
      return (
        directClaims.length === 0 ||
        directClaims.some(
          ({ amounts, negated }) => negated || amounts.some((amount) => amount !== expectedValue),
        )
      );
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

function stripMarkdownFences(text: string): string {
  let fence: { character: string; length: number } | undefined;
  return text
    .split("\n")
    .filter((line) => {
      if (fence) {
        const closing = line.match(/^ {0,3}(`+|~+)\s*$/);
        if (closing && closing[1]![0] === fence.character && closing[1]!.length >= fence.length) {
          fence = undefined;
        }
        return false;
      }
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (!opening) return true;
      fence = { character: opening[1]![0]!, length: opening[1]!.length };
      return false;
    })
    .join("\n");
}

function validateMarkdownRows(text: string, expectedRows: string[][]): string[] {
  const normalizeCell = (value: string) => {
    const normalized = normalizeText(value)
      .replace(/円$/, "")
      .replace(/^[¥￥]/, "");
    const date = normalized.match(/^(\d{4})(?:年|[-/])(\d{1,2})(?:月|[-/])(\d{1,2})日?$/);
    return date
      ? `${date[1]}-${date[2]!.padStart(2, "0")}-${date[3]!.padStart(2, "0")}`
      : normalized;
  };
  const tableLines: string[] = [];
  let candidateLines: string[] = [];
  const isSeparatorLine = (line: string) => {
    const cells = line
      .replace(/^\s*\||\|\s*$/g, "")
      .split("|")
      .map((cell) => cell.trim());
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  };
  const flushCandidate = () => {
    if (candidateLines.length >= 2 && isSeparatorLine(candidateLines[1]!)) {
      tableLines.push(...candidateLines);
    }
    candidateLines = [];
  };
  const renderedText = stripMarkdownFences(text);
  for (const line of renderedText.split("\n")) {
    if (line.includes("|")) candidateLines.push(line);
    else flushCandidate();
  }
  flushCandidate();

  const actualRows = tableLines
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

function getRelevantDatabaseResult(
  trace: EvaluationOutput["toolTrace"][number],
  config: NonNullable<AssertionContext["config"]>["databaseQuery"],
): DatabaseResult | undefined {
  if (
    !config ||
    trace.toolName !== "queryDatabase" ||
    !trace.succeeded ||
    trace.output === undefined ||
    typeof trace.input !== "object" ||
    trace.input === null ||
    !("sql" in trace.input)
  ) {
    return undefined;
  }

  const sql =
    typeof trace.input.sql === "string"
      ? trace.input.sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
      : "";
  const maskedSql = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/g, (literal) =>
    " ".repeat(literal.length),
  );
  const predicateIndex = maskedSql.search(/\b(?:where|join)\b/i);
  const predicateSql = predicateIndex === -1 ? "" : maskedSql.slice(predicateIndex);
  const hasRequiredPredicates = config.sqlPatterns.every((pattern) =>
    new RegExp(pattern, "i").test(sql),
  );
  const hasRequiredPredicateClauses = (config.predicatePatterns ?? []).every((pattern) =>
    new RegExp(pattern, "i").test(predicateSql),
  );
  const hasRequiredOutputExpressions = (config.outputSqlPatterns ?? []).every((pattern) =>
    new RegExp(pattern, "i").test(sql),
  );
  const hasForbiddenLiteral = (config.forbiddenSqlPatterns ?? []).some((pattern) =>
    new RegExp(pattern, "i").test(sql),
  );
  if (
    !hasRequiredPredicates ||
    !hasRequiredPredicateClauses ||
    !hasRequiredOutputExpressions ||
    hasForbiddenLiteral
  ) {
    return undefined;
  }

  const result = databaseResultSchema.safeParse(trace.output);
  return result.success ? result.data : undefined;
}

export default function assertFinanceChatOutput(
  output: string,
  context: AssertionContext,
): AssertionResult {
  const actual = parseOutput(output);
  if (!actual) return fail("出力がfinance chatの評価JSON形式ではありません。");

  const config = context.config ?? {};
  const lowerText = actual.text.toLocaleLowerCase();
  const forbiddenTerms = (config.forbiddenTextTerms ?? []).filter((term) =>
    lowerText.includes(term.toLocaleLowerCase()),
  );
  if (forbiddenTerms.length > 0) {
    return fail(`本文に内部用語が含まれています: ${forbiddenTerms.join(", ")}`);
  }
  const missingTextPatterns = (config.expectedTextPatterns ?? []).filter(
    (pattern) => !new RegExp(pattern, "s").test(actual.text),
  );
  if (missingTextPatterns.length > 0) {
    return fail(`本文が期待する表現に一致しません: ${missingTextPatterns.join(", ")}`);
  }
  const missingFacts = (config.expectedTextFacts ?? []).filter(
    (fact) => !includesFact(actual.text, fact),
  );
  if (missingFacts.length > 0) {
    return fail(`本文に期待する事実がありません: ${missingFacts.join(", ")}`);
  }
  const missingPairs = validateTextPairs(
    actual.text,
    config.expectedTextPairs ?? [],
    config.textPairBoundaries ?? [],
  );
  if (missingPairs.length > 0) {
    return fail(`本文のラベルと値の組み合わせが期待値と異なります: ${missingPairs.join(", ")}`);
  }
  const normalizedAnswer = actual.text.normalize("NFKC");
  if (
    config.forbidAmounts &&
    (/[¥￥]\s*\d|\d[\d,.]*\s*(?:円|万\s*円|億\s*円|兆\s*円)|[一二三四五六七八九十百千万億兆〇零]+円/.test(
      normalizedAnswer,
    ) ||
      /(?:収入|支出|収支|残高|金額|合計|総額)[^\d\n]{0,8}-?\d[\d,.]*(?![\d年月日件])/.test(
        normalizedAnswer,
      ))
  ) {
    return fail("データのない回答に金額が含まれています。");
  }
  const databaseQuery = config.databaseQuery;
  if (databaseQuery) {
    const relevantResults = actual.toolTrace.flatMap((trace) => {
      const result = getRelevantDatabaseResult(trace, databaseQuery);
      return result ? [result] : [];
    });
    if (relevantResults.length === 0) {
      return fail("回答に必要なpredicateと型を満たすqueryDatabase結果がありません。");
    }
    const completeResults = relevantResults.filter((result) => !result.truncated);
    const expectedCells = databaseQuery.outputCells ?? [];
    const expectedRows = databaseQuery.outputRows ?? [];
    const fullCellMask = (1 << expectedCells.length) - 1;
    const fullRowMask = (1 << expectedRows.length) - 1;
    const maxRows =
      databaseQuery.expectedRowCount ??
      Math.max(1, ...completeResults.map((result) => result.rows.length));
    interface EvidenceState {
      cellMask: number;
      provesNoData: boolean;
      rowCount: number;
      rowMask: number;
      used: boolean;
    }
    const toKey = (state: EvidenceState) =>
      `${state.rowCount}:${state.cellMask}:${state.rowMask}:${Number(state.provesNoData)}:${Number(state.used)}`;
    let states = new Map<string, EvidenceState>();
    const emptyState: EvidenceState = {
      cellMask: 0,
      provesNoData: true,
      rowCount: 0,
      rowMask: 0,
      used: false,
    };
    states.set(toKey(emptyState), emptyState);
    for (const result of completeResults) {
      const resultCellMask = expectedCells.reduce((mask, expectation, index) => {
        const matched = result.rows.some((row) =>
          Object.entries(row).some(
            ([column, value]) =>
              new RegExp(expectation.columnPattern, "i").test(column) &&
              (typeof value === "number" || typeof value === "string") &&
              normalizeText(String(value)) === normalizeText(expectation.value),
          ),
        );
        return matched ? mask | (1 << index) : mask;
      }, 0);
      const resultRowMask = expectedRows.reduce((mask, expectedRow, index) => {
        const matched = result.rows.some((row) => {
          const values = Object.values(row)
            .filter((value): value is number | string =>
              ["number", "string"].includes(typeof value),
            )
            .map((value) => normalizeText(String(value)));
          return expectedRow.every((expected) => values.includes(normalizeText(expected)));
        });
        return matched ? mask | (1 << index) : mask;
      }, 0);
      const resultProvesNoData =
        result.rows.length === 0 ||
        result.rows.every((row) =>
          Object.values(row).every((value) => value === 0 || value === null),
        );
      const nextStates = new Map(states);
      for (const state of states.values()) {
        const rowCount = state.rowCount + result.rows.length;
        if (rowCount > maxRows) continue;
        const nextState: EvidenceState = {
          cellMask: state.cellMask | resultCellMask,
          provesNoData: state.provesNoData && resultProvesNoData,
          rowCount,
          rowMask: state.rowMask | resultRowMask,
          used: true,
        };
        nextStates.set(toKey(nextState), nextState);
      }
      states = nextStates;
    }
    const hasCompleteEvidence = [...states.values()].some(
      (state) =>
        state.used &&
        state.cellMask === fullCellMask &&
        state.rowMask === fullRowMask &&
        (databaseQuery.expectedRowCount === undefined ||
          state.rowCount === databaseQuery.expectedRowCount) &&
        (databaseQuery.expectEmpty !== true || state.provesNoData),
    );
    if (!hasCompleteEvidence) {
      return fail("queryDatabase結果に期待する完全な根拠行がありません。");
    }
    if (
      databaseQuery.expectEmpty === true &&
      /0件(?:では|じゃ)(?:ありません|ない)/.test(actual.text)
    ) {
      return fail("データなし回答が0件という結論を否定しています。");
    }
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
  const expectedRenderedLinks = config.expectedRenderedLinks;
  if (
    expectedRenderedLinks &&
    JSON.stringify(actual.renderedLinks) !== JSON.stringify(expectedRenderedLinks)
  ) {
    return fail(
      `描画可能linkが期待値と異なります: expected=${JSON.stringify(expectedRenderedLinks)}, actual=${JSON.stringify(actual.renderedLinks)}`,
    );
  }
  const provenRoutes = new Set(actual.toolRoutes);
  const unprovenLinks = actual.textLinks.filter((link) => !provenRoutes.has(link));
  if (unprovenLinks.length > 0) {
    return fail(`route toolに由来しない本文linkがあります: ${unprovenLinks.join(", ")}`);
  }

  return { pass: true, score: 1, reason: "期待するfinance chat出力です。" };
}
