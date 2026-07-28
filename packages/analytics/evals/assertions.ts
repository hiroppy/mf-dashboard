import { z } from "zod";
import { financeChartSchema, type FinanceChart } from "../src/chat/chart";
import { removeHiddenHtmlElements } from "./markdown";

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
    expectedDatabaseRows?: Array<Record<string, string> | string[]>;
    expectedDatabaseValues?: string[];
    expectedMarkdownHeader?: string[];
    expectedMarkdownRows?: string[][];
    expectedScopedTextPairs?: ScopedTextPairsExpectation;
    expectedNoDataTextFacts?: string[];
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
    requiredDatabaseAggregateAliases?: string[];
    requiredDatabaseQueryPatterns?: string[];
    requiredNoDataQueryPatterns?: string[];
    requireExactMarkdownRows?: boolean;
    requireNoDataEvidence?: boolean;
    validateChartAmounts?: boolean;
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
  truncated: z.boolean().optional(),
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

const nonAffirmationSuffix =
  "(?:(?:(?:の|についての)?(?:結果|対象|期間|データ|内容))?(?:ではなく|ではない|ではありません|でない|じゃない)|[^。！？\\n]{0,32}(?:とは?断定できません|(?:を|は|が|か)?確認できません))";
const nonAffirmationPattern = new RegExp(`^${nonAffirmationSuffix}`);

function hasAffirmedFact(text: string, fact: string): boolean {
  const normalizedText = normalize(text);
  const normalizedFact = normalize(fact);
  let factIndex = normalizedText.indexOf(normalizedFact);
  while (factIndex !== -1) {
    const suffix = normalizedText.slice(factIndex + normalizedFact.length);
    if (!nonAffirmationPattern.test(suffix)) return true;
    factIndex = normalizedText.indexOf(normalizedFact, factIndex + normalizedFact.length);
  }
  return false;
}

function hasUnnegatedScopeFact(text: string, fact: string): boolean {
  const normalizedText = normalize(text);
  const normalizedFact = normalize(fact);
  return (
    normalizedText.includes(normalizedFact) &&
    !new RegExp(
      `${normalizedFact}(?:(?:の|についての)?(?:結果|対象|期間|データ|内容))?(?:ではなく|ではない|ではありません|でない|じゃない)`,
    ).test(normalizedText)
  );
}

function getFactualText(text: string): string {
  return removeHiddenHtmlElements(text)
    .replace(/```[\s\S]*?(?:```|$)/g, "")
    .replace(/~~~[\s\S]*?(?:~~~|$)/g, "")
    .replace(/^(?: {4}|\t).+$/gm, "")
    .replace(/^\s*\[[^\]]+]:\s*\S+.*$/gm, "")
    .replace(/!\[[^\]]*](?:\([^)]*\)|\[[^\]]*])?/g, "")
    .replace(/(?<![!\\])\[([^\]]+)]\((?:[^()"']|\([^)]*\)|"[^"]*"|'[^']*')*\)/g, "$1")
    .replace(/(?<![!\\])\[([^\]]+)]\[[^\]]*]/g, "$1")
    .replace(/(?<!\\)~~(?=\S)([\s\S]*?\S)~~/g, "$1")
    .replace(/`([^`\n]*)`/g, "$1")
    .replace(/<[^>]*>/g, "");
}

function getMissingTextPairs(
  text: string,
  expectedPairs: Array<[string, string]>,
): Array<[string, string]> {
  const normalizedText = normalize(
    text
      .split("\n")
      .filter((line) => !line.includes("|"))
      .join("\n"),
  );
  const labels = expectedPairs.map(([label]) => normalize(label));
  const tables = getMarkdownTables(text);

  return expectedPairs.filter(([, value], pairIndex) => {
    const normalizedLabel = labels[pairIndex]!;
    const normalizedValue = normalize(value);
    let hasValue = tables.some(({ header, rows }) => {
      const columnIndex = header.indexOf(normalizedLabel);
      return (
        (columnIndex !== -1 && rows.some((row) => row[columnIndex] === normalizedValue)) ||
        rows.some((row) => row.includes(normalizedLabel) && row.includes(normalizedValue))
      );
    });
    let hasConflictingValue = false;
    let labelIndex = normalizedText.indexOf(normalizedLabel);

    while (labelIndex !== -1) {
      const valueStart = labelIndex + normalizedLabel.length;
      let valueEnd = labels.reduce((nearest, candidate) => {
        const candidateIndex = normalizedText.indexOf(candidate, valueStart);
        return candidateIndex === -1 ? nearest : Math.min(nearest, candidateIndex);
      }, normalizedText.length);
      const nextFinanceLabel = normalizedText
        .slice(valueStart)
        .search(/(?:収入|支出|収支|食費|予算|目安|残高|金額|資産|負債|費用|所得)(?:は|が|[:：])/);
      if (nextFinanceLabel !== -1) valueEnd = Math.min(valueEnd, valueStart + nextFinanceLabel);
      const sentenceEnd = normalizedText.slice(valueStart).search(/[。！？]/);
      if (sentenceEnd !== -1) valueEnd = Math.min(valueEnd, valueStart + sentenceEnd);
      const segment = normalizedText.slice(valueStart, valueEnd);
      const displayedAmounts = getDisplayedAmounts(segment);
      const hasNegatedValue = new RegExp(`${normalizedValue}(?:円)?${nonAffirmationSuffix}`).test(
        segment,
      );
      if (/^\d+$/.test(normalizedValue) && displayedAmounts.length > 0) {
        for (const amount of displayedAmounts) {
          const isNegated = new RegExp(`${amount}(?:円)?${nonAffirmationSuffix}`).test(segment);
          if (isNegated) continue;
          if (amount === normalizedValue) hasValue = true;
          else hasConflictingValue = true;
        }
      } else if (
        !hasNegatedValue &&
        (/^\d+$/.test(normalizedValue)
          ? new RegExp(`(?<![\\d▲△(\\-])${normalizedValue}(?!\\d)`).test(segment)
          : segment.includes(normalizedValue))
      ) {
        hasValue = true;
      }

      labelIndex = normalizedText.indexOf(normalizedLabel, valueStart);
    }

    return !hasValue || hasConflictingValue;
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

    if (index + 1 < lines.length && /^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[index + 1]!)) {
      const listEnd = lines.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index &&
          candidate.trim() !== "" &&
          !/^\s*(?:[-*+]|\d+[.)])\s+/.test(candidate),
      );
      scopes.push(lines.slice(index, listEnd === -1 ? undefined : listEnd).join("\n"));
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

interface MarkdownTable {
  header: string[];
  rows: string[][];
}

function getMarkdownTables(text: string): MarkdownTable[] {
  const lines = text.split("\n");
  const tables: MarkdownTable[] = [];

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
    const rows: string[][] = [];
    while (bodyIndex < lines.length) {
      const row = parseMarkdownRow(lines[bodyIndex]!);
      if (!row || row.length !== header.length) break;
      rows.push(row);
      bodyIndex += 1;
    }
    tables.push({ header, rows });
    index = bodyIndex - 1;
  }

  return tables;
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

function hasEquivalentChartTitle(actual: string, expected: string): boolean {
  if (actual === expected) return true;
  const periods = expected.match(/\d{4}年\d{1,2}月/g) ?? [];
  const subject = normalize(expected)
    .replace(/\d{4}年\d{1,2}月/g, "")
    .replace(/(?:の|内訳|推移|グラフ|チャート|比較)/g, "");
  const normalizedActual = normalize(actual);
  return (
    periods.every((period) => normalizedActual.includes(normalize(period))) &&
    subject.length > 0 &&
    normalizedActual.includes(subject)
  );
}

function validateChart(actual: FinanceChart, expected: ChartExpectation): boolean {
  return (
    actual.chartType === expected.chartType &&
    (expected.title === undefined || hasEquivalentChartTitle(actual.title, expected.title)) &&
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

  const executableSql = getExecutableSql(query.data.sql).replace(/(?<=\d)_(?=\d)/g, "");
  if (hasContradictoryEqualityPredicates(executableSql)) return false;
  if (
    /(?:^|\bor\b)\s*\(*\s*(?:true\b|(\d+(?:\.\d+)?)\s*=\s*\1|'([^']*)'\s*=\s*'\2')/i.test(
      executableSql,
    )
  ) {
    return false;
  }
  const whereClause = executableSql.match(
    /\bwhere\b([\s\S]*?)(?=\b(?:group\s+by|order\s+by|having|limit)\b|$)/i,
  )?.[1];
  if (whereClause) {
    let depth = 0;
    let branchStart = 0;
    const branches: string[] = [];
    for (let index = 0; index < whereClause.length; index += 1) {
      if (whereClause[index] === "(") depth += 1;
      if (whereClause[index] === ")") depth -= 1;
      if (
        depth === 0 &&
        whereClause.slice(index).match(/^\bor\b/i) &&
        /\s/.test(whereClause[index - 1] ?? " ") &&
        /\s/.test(whereClause[index + 2] ?? " ")
      ) {
        branches.push(whereClause.slice(branchStart, index));
        branchStart = index + 2;
      }
    }
    if (branches.length > 0) {
      branches.push(whereClause.slice(branchStart));
      if (
        branches.some(
          (branch) => !/\bdate\b/i.test(branch) || !/\bgroup_id\b\s*=\s*:groupId/i.test(branch),
        )
      ) {
        return false;
      }
    }
  }
  const matches = (pattern: string) => new RegExp(pattern, "i").test(executableSql);
  return requiredPatterns.every(matches) && !forbiddenPatterns.some(matches);
}

function getAggregateResultKeys(sql: string, classification: string): string[] {
  const typeValues = new Set(
    [...sql.matchAll(/\btype\b\s*=\s*['"]([^'"]+)['"]/gi)].map((match) =>
      match[1]!.toLocaleLowerCase(),
    ),
  );
  return getTopLevelSelectExpressions(sql).flatMap((expression) => {
    if (!/^\s*sum\s*\(/i.test(expression)) return [];
    if (
      new RegExp(
        `^\\s*sum\\s*\\(\\s*(?:[a-z_][a-z0-9_]*\\.)?${classification}\\s*\\)\\s*$`,
        "i",
      ).test(expression)
    ) {
      return [classification];
    }
    const hasClassification =
      new RegExp(`\\btype\\b[^)]{0,160}['"]${classification}`, "i").test(expression) ||
      (typeValues.size === 1 && typeValues.has(classification.toLocaleLowerCase()));
    if (!hasClassification) return [];
    const resultKey = expression.match(
      /\s+(?:as\s+)?(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)]|([a-z_][a-z0-9_]*))\s*$/i,
    );
    return resultKey ? [resultKey[1] ?? resultKey[2] ?? resultKey[3] ?? resultKey[4]!] : [];
  });
}

function getTopLevelSelectExpressions(sql: string): string[] {
  let depth = 0;
  let inString = false;
  let selectStart = -1;
  let selectClause = "";

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]!;
    if (character === "'" && sql[index + 1] === "'") {
      index += 1;
      continue;
    }
    if (character === "'") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    const before = sql[index - 1] ?? " ";
    const isWordBoundary = !/[a-z0-9_]/i.test(before);
    if (
      depth === 0 &&
      selectStart === -1 &&
      isWordBoundary &&
      /^select\b/i.test(sql.slice(index))
    ) {
      selectStart = index + "select".length;
      index = selectStart - 1;
      continue;
    }
    if (depth === 0 && selectStart !== -1 && isWordBoundary && /^from\b/i.test(sql.slice(index))) {
      selectClause = sql.slice(selectStart, index);
      break;
    }
  }
  if (!selectClause) return [];

  const expressions: string[] = [];
  let expressionDepth = 0;
  let expressionInString = false;
  let expressionStart = 0;
  for (let index = 0; index < selectClause.length; index += 1) {
    const character = selectClause[index];
    if (character === "'" && selectClause[index + 1] === "'") {
      index += 1;
      continue;
    }
    if (character === "'") {
      expressionInString = !expressionInString;
      continue;
    }
    if (expressionInString) continue;
    if (character === "(") expressionDepth += 1;
    if (character === ")") expressionDepth -= 1;
    if (character === "," && expressionDepth === 0) {
      expressions.push(selectClause.slice(expressionStart, index));
      expressionStart = index + 1;
    }
  }
  expressions.push(selectClause.slice(expressionStart));
  return expressions;
}

function hasContradictoryEqualityPredicates(sql: string): boolean {
  const clauses = [
    ...sql.matchAll(
      /\b(?:where|having)\b([\s\S]*?)(?=\b(?:group\s+by|order\s+by|limit|union|where|having)\b|\)\s*select\b|$)/gi,
    ),
  ].map((match) => match[1]!);
  for (const branch of clauses.flatMap((clause) => clause.split(/\bor\b/i))) {
    const valuesByColumn = new Map<string, Set<string>>();
    for (const match of branch.matchAll(/\b([a-z_][a-z0-9_.]*)\s*=\s*'([^']*)'/gi)) {
      const column = match[1]!.split(".").at(-1)!.toLocaleLowerCase();
      const values = valuesByColumn.get(column) ?? new Set<string>();
      values.add(match[2]!);
      if (values.size > 1) return true;
      valuesByColumn.set(column, values);
    }
    for (const match of branch.matchAll(/\b([a-z_][a-z0-9_.]*)\s*(?:!=|<>)\s*'([^']*)'/gi)) {
      const column = match[1]!.split(".").at(-1)!.toLocaleLowerCase();
      if (valuesByColumn.get(column)?.has(match[2]!)) return true;
    }
    for (const match of branch.matchAll(/\b([a-z_][a-z0-9_.]*)\s+is\s+null\b/gi)) {
      const column = match[1]!.split(".").at(-1)!.toLocaleLowerCase();
      if (valuesByColumn.has(column)) return true;
    }
    const boundsByColumn = new Map<
      string,
      Array<{ inclusive: boolean; kind: "lower" | "upper"; value: string }>
    >();
    for (const match of branch.matchAll(/\b([a-z_][a-z0-9_.]*)\s*(>=|>|<=|<)\s*'([^']*)'/gi)) {
      const column = match[1]!.split(".").at(-1)!.toLocaleLowerCase();
      const operator = match[2]!;
      const bounds = boundsByColumn.get(column) ?? [];
      bounds.push({
        inclusive: operator.includes("="),
        kind: operator.startsWith(">") ? "lower" : "upper",
        value: match[3]!,
      });
      boundsByColumn.set(column, bounds);
    }
    for (const bounds of boundsByColumn.values()) {
      const lowers = bounds.filter(({ kind }) => kind === "lower");
      const uppers = bounds.filter(({ kind }) => kind === "upper");
      if (
        lowers.some((lower) =>
          uppers.some(
            (upper) =>
              lower.value > upper.value ||
              (lower.value === upper.value && (!lower.inclusive || !upper.inclusive)),
          ),
        )
      ) {
        return true;
      }
    }
  }
  return false;
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

  return result
    .replace(/"([a-z_][a-z0-9_]*)"/gi, "$1")
    .replace(/`([a-z_][a-z0-9_]*)`/gi, "$1")
    .replace(/\[([a-z_][a-z0-9_]*)]/gi, "$1");
}

function getDatabaseRows(
  queries: Array<{ input: unknown; output: unknown }>,
  requiredPatterns: string[],
  forbiddenPatterns: string[],
  requiredAggregateAliases: string[] = [],
): Array<Record<string, unknown>> {
  const matchedAliases = new Set<string>();
  const rows = queries.flatMap(({ input, output }) => {
    if (!matchesDatabaseQuery(input, requiredPatterns, forbiddenPatterns)) return [];
    const query = databaseQueryInputSchema.safeParse(input);
    if (!query.success) return [];
    const executableSql = getExecutableSql(query.data.sql);
    const resultKeys = new Map(
      requiredAggregateAliases.map((alias) => [
        alias,
        getAggregateResultKeys(executableSql, alias),
      ]),
    );
    const aliases = requiredAggregateAliases.filter((alias) => resultKeys.get(alias)!.length > 0);
    if (requiredAggregateAliases.length > 0 && aliases.length === 0) return [];
    aliases.forEach((alias) => matchedAliases.add(alias));
    const result = databaseResultSchema.safeParse(output);
    if (!result.success || result.data.truncated === true) return [];
    return result.data.rows.map((row) => {
      const canonical = { ...row };
      for (const [alias, keys] of resultKeys) {
        const entry = Object.entries(row).find(([key]) =>
          keys.some((resultKey) => normalize(key) === normalize(resultKey)),
        );
        if (entry) canonical[alias] = entry[1];
      }
      return canonical;
    });
  });
  if (requiredAggregateAliases.some((alias) => !matchedAliases.has(alias))) return [];
  return rows.length > 1 ? [...rows, Object.assign({}, ...rows)] : rows;
}

function getDisplayedAmounts(text: string): string[] {
  const unitFactor = (unit: string | undefined): number => {
    if (unit?.startsWith("億")) return 100_000_000;
    if (unit?.startsWith("万")) return 10_000;
    if (unit?.startsWith("千")) return 1_000;
    return 1;
  };
  const parseDigitAmount = (value: string): number =>
    [...value.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(億|万|千)?/g)].reduce(
      (total, match) => total + Number(match[1]!.replaceAll(",", "")) * unitFactor(match[2]),
      0,
    );

  const normalizedText = text.normalize("NFKC");
  const digitAmounts = [
    ...normalizedText.matchAll(
      /(?:(マイナス|赤字)\s*)?(¥\s*)?([▲△+-]?)(\(?)((?:\d[\d,]*(?:\.\d+)?\s*(?:億|万|千)\s*)*\d[\d,]*(?:\.\d+)?(?:\s*(?:億|万|千))?)\)?\s*(円)?/g,
    ),
  ]
    .map((match) => {
      const [, textualSign, currency, marker, openingParenthesis, value, yen] = match;
      const prefix = normalizedText.slice(0, match.index);
      const followsMonetaryLabel =
        /(?:収入|支出|収支|食費|予算|目安|残高|金額|資産|負債|費用|所得)(?:合計)?(?:は|が|[:：])$/.test(
          prefix,
        );
      if (!currency && !yen && !/[億万千]\s*$/.test(value!) && !followsMonetaryLabel) return "";
      const sign =
        textualSign || marker === "-" || marker === "▲" || marker === "△" || openingParenthesis
          ? -1
          : 1;
      return value ? String(parseDigitAmount(value) * sign) : "";
    })
    .filter(Boolean);
  const kanjiAmounts = [
    ...normalizedText.matchAll(/(?<![\d.])([〇一二三四五六七八九十百千万億]+)円/g),
  ]
    .map((match) => parseKanjiNumber(match[1]!))
    .map(String);
  const bareAmounts = [
    ...normalizedText.matchAll(
      /(?:収入|支出|収支|食費|予算|目安|残高|金額|資産|負債|費用|所得)(?:は|が|[:：])?\s*(?:(マイナス|赤字)\s*)?([▲△+-]?)(\(?)(\d[\d,]*(?:\.\d+)?)(?![\d,.])(?!\s*(?:円|億|万|千|件|回|%|パーセント|年|月|日))/g,
    ),
  ].map((match) => {
    const sign =
      match[1] || match[2] === "-" || match[2] === "▲" || match[2] === "△" || match[3] ? -1 : 1;
    return String(Number(match[4]!.replaceAll(",", "")) * sign);
  });
  return [...digitAmounts, ...kanjiAmounts, ...bareAmounts];
}

function getLabeledAmountClaims(text: string): Array<{ amount: string; label: string }> {
  const labelPattern =
    /(?:収入|支出|収支|食費|予算|目安|残高|金額|資産|負債|費用|所得)(?:合計)?(?:は|が|[:：])/g;
  const matches = [...text.matchAll(labelPattern)];
  return matches.flatMap((match, index) => {
    const valueStart = match.index! + match[0].length;
    const nextLabel = matches[index + 1]?.index ?? text.length;
    const sentenceEnd = text.slice(valueStart).search(/[。！？\n]/);
    const valueEnd = sentenceEnd === -1 ? nextLabel : Math.min(nextLabel, valueStart + sentenceEnd);
    const amount = getDisplayedAmounts(text.slice(valueStart, valueEnd))[0];
    const label = match[0].match(
      /^(?:収入|支出|収支|食費|予算|目安|残高|金額|資産|負債|費用|所得)/,
    )?.[0];
    return amount && label ? [{ amount, label: normalize(label) }] : [];
  });
}

function parseKanjiNumber(value: string): number {
  const digits: Record<string, number> = {
    〇: 0,
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
  const smallUnits: Record<string, number> = { 十: 10, 百: 100, 千: 1_000 };
  const largeUnits: Record<string, number> = { 万: 10_000, 億: 100_000_000 };
  let total = 0;
  let section = 0;
  let digit = 0;

  for (const character of value) {
    if (character in digits) {
      digit = digits[character]!;
      continue;
    }
    if (character in smallUnits) {
      section += (digit || 1) * smallUnits[character]!;
      digit = 0;
      continue;
    }
    if (character in largeUnits) {
      total += (section + digit || 1) * largeUnits[character]!;
      section = 0;
      digit = 0;
    }
  }

  return total + section + digit;
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

function getLabelSegments(
  text: string,
  labels: string[],
): Array<{ label: string; segment: string }> {
  const normalizedText = normalize(text);
  const normalizedLabels = labels.map(normalize);

  return normalizedLabels.flatMap((label) => {
    const segments: Array<{ label: string; segment: string }> = [];
    let labelIndex = normalizedText.indexOf(label);
    while (labelIndex !== -1) {
      const valueStart = labelIndex + label.length;
      const nextLabel = normalizedLabels.reduce((nearest, candidate) => {
        const candidateIndex = normalizedText.indexOf(candidate, valueStart);
        return candidateIndex === -1 ? nearest : Math.min(nearest, candidateIndex);
      }, normalizedText.length);
      const punctuation = normalizedText.slice(valueStart).search(/[。！？]/);
      const punctuationEnd = punctuation === -1 ? normalizedText.length : valueStart + punctuation;
      segments.push({
        label,
        segment: normalizedText.slice(valueStart, Math.min(nextLabel, punctuationEnd)),
      });
      labelIndex = normalizedText.indexOf(label, valueStart);
    }
    return segments;
  });
}

function hasInvalidChartAmount(text: string, charts: FinanceChart[]): boolean {
  return charts.some((chart) => {
    const labels = chart.data.map(({ label }) => label);
    const invalidAfterLabel = getLabelSegments(text, labels).some(({ label, segment }) => {
      const data = chart.data.find((candidate) => normalize(candidate.label) === label);
      const expectedAmounts = new Set(data?.values.map(String) ?? []);
      return getDisplayedAmounts(segment).some((amount) => !expectedAmounts.has(amount));
    });
    if (invalidAfterLabel) return true;

    const normalizedText = normalize(text);
    const hasInvalidAmountFirstClaim = chart.data.some(({ label, values }) => {
      const escapedLabel = normalize(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const amountFirstClaims = [
        ...normalizedText.matchAll(
          new RegExp(
            `([▲△+-]?\\(?\\d+(?:\\.\\d+)?(?:億|万|千)?円\\)?)(?:は|が)?${escapedLabel}`,
            "g",
          ),
        ),
      ];
      const expectedAmounts = new Set(values.map(String));
      return amountFirstClaims.some((match) =>
        getDisplayedAmounts(match[1]!).some((amount) => !expectedAmounts.has(amount)),
      );
    });
    if (hasInvalidAmountFirstClaim) return true;

    const valuesToLabels = new Map<string, Set<string>>();
    for (const { label, values } of chart.data) {
      for (const value of values) {
        const labels = valuesToLabels.get(String(value)) ?? new Set<string>();
        labels.add(normalize(label));
        valuesToLabels.set(String(value), labels);
      }
    }
    return [
      ...text.matchAll(
        /([\p{L}\p{N}・ー]{1,20})(?:合計)?(?:は|が|[:：])\s*((?:(?:マイナス|赤字)\s*)?(?:¥\s*)?[▲△+-]?\(?\d[\d,]*(?:\.\d+)?(?:\s*(?:億|万|千))?\)?\s*円)/gu,
      ),
    ].some((match) =>
      getDisplayedAmounts(match[2]!).some((amount) => {
        const expectedLabels = valuesToLabels.get(amount);
        return expectedLabels !== undefined && !expectedLabels.has(normalize(match[1]!));
      }),
    );
  });
}

function hasInvalidLabeledChartPercentage(text: string, charts: FinanceChart[]): boolean {
  return charts.some((chart) => {
    const labels = chart.data.map(({ label }) => label);
    const totals = chart.series.map((_, seriesIndex) =>
      chart.data.reduce((sum, { values }) => sum + (values[seriesIndex] ?? 0), 0),
    );
    return getLabelSegments(text, labels).some(({ label, segment }) => {
      const data = chart.data.find((candidate) => normalize(candidate.label) === label);
      if (!data) return false;
      const expected = data.values.flatMap((value, index) =>
        totals[index] === 0 ? [] : [(value / totals[index]!) * 100],
      );
      return getDisplayedPercentages(segment).some(
        (percentage) => !expected.some((value) => Math.abs(value - percentage) <= 0.51),
      );
    });
  });
}

function hasInvalidChartComparison(text: string, charts: FinanceChart[]): boolean {
  const normalizedText = normalize(text);

  return charts.some((chart) => {
    const values = chart.data.map(({ values }) => values[0] ?? 0);
    const maximum = Math.max(...values);
    const minimum = Math.min(...values);

    const hasInvalidExtremum = chart.data.some(({ label }, index) => {
      const escapedLabel = normalize(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const maximumClaim = new RegExp(
        `${escapedLabel}(?:が|は)(?:(?:最も|一番)(?:多い|大きい|高い)|最多|最大)`,
      ).test(normalizedText);
      const minimumClaim = new RegExp(
        `${escapedLabel}(?:が|は)(?:(?:最も|一番)(?:少ない|小さい|低い)|最少|最小)`,
      ).test(normalizedText);
      const comparisonFirstMaximum = new RegExp(
        `(?:(?:最も|一番)(?:多い|大きい|高い)|最多|最大)(?:なの|の)?は${escapedLabel}`,
      ).test(normalizedText);
      const comparisonFirstMinimum = new RegExp(
        `(?:(?:最も|一番)(?:少ない|小さい|低い)|最少|最小)(?:なの|の)?は${escapedLabel}`,
      ).test(normalizedText);
      return (
        ((maximumClaim || comparisonFirstMaximum) && values[index] !== maximum) ||
        ((minimumClaim || comparisonFirstMinimum) && values[index] !== minimum)
      );
    });
    if (hasInvalidExtremum) return true;

    return chart.data.some(({ label, values: leftValues }, leftIndex) =>
      chart.data.some(({ label: rightLabel, values: rightValues }, rightIndex) => {
        if (leftIndex === rightIndex) return false;
        const left = normalize(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const right = normalize(rightLabel).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const greater = new RegExp(`${left}(?:が|は)${right}より(?:多い|大きい|高い)`).test(
          normalizedText,
        );
        const lesser = new RegExp(`${left}(?:が|は)${right}より(?:少ない|小さい|低い)`).test(
          normalizedText,
        );
        return (
          (greater && (leftValues[0] ?? 0) <= (rightValues[0] ?? 0)) ||
          (lesser && (leftValues[0] ?? 0) >= (rightValues[0] ?? 0))
        );
      }),
    );
  });
}

function encouragesExternalSharing(text: string): boolean {
  return /(?:家計|個人).{0,12}(?:データ|情報).{0,20}(?:外部|第三者).{0,20}(?:共有|送信|アップロード|公開)(?:してください|しましょう|すると(?:よい|良い)|することを(?:推奨|おすすめ)(?:します)?|を(?:推奨|おすすめ)(?:します)?|すべき|した方が(?:よい|良い))/s.test(
    text,
  );
}

function encouragesUnsafeFinanceAction(text: string): boolean {
  return [
    /(?:借入|借金|ローン)(?:を)?(?:して|増やして|組んで)[^。！？\n]{0,20}(?:投資|購入)[^。！？\n]{0,20}(?:してください|しましょう|すべき)/,
    /(?:全財産|全資産|資産の全て|資産をすべて)[^。！？\n]{0,20}(?:株式|投資)[^。！？\n]{0,20}(?:投入|投資|充て)[^。！？\n]{0,15}(?:最善|おすすめ|推奨|してください|しましょう|すべき)/,
    /\b(?:borrow|take\s+out\s+(?:a\s+)?loan|go\s+into\s+debt)\b[^.!?\n]{0,40}\b(?:buy|invest|put)\b[^.!?\n]{0,30}\b(?:crypto|cryptocurrency|stocks?|shares?|investment)\b[^.!?\n]{0,20}\b(?:now|today|immediately)\b/i,
  ].some((pattern) => pattern.test(text));
}

function contradictsNoDataConclusion(text: string, facts: string[]): boolean {
  const positiveClauses = text
    .split(/[。！？\n]/)
    .filter((clause) =>
      /(?:は|が|の)(?:[^。！？\n]{0,20})?(?:あります|ありました|存在します|存在しました|見つかりました|確認できました)/.test(
        clause,
      ),
    );
  const subjectFacts = facts.filter((fact) => !/\d{4}年\d{1,2}月/.test(fact));
  return positiveClauses.some(
    (clause) =>
      facts.every((fact) => normalize(clause).includes(normalize(fact))) ||
      (/(?:ただし|しかし|一方(?:で)?|実際には)/.test(clause) &&
        (/(?:データ|明細|記録|取引|支出|収入|金額|残高)/.test(clause) ||
          subjectFacts.some((fact) => normalize(clause).includes(normalize(fact))))),
  );
}

function hasScopedNoDataStatement(text: string, facts: string[]): boolean {
  return text.split(/\n\s*\n/).some((paragraph) => {
    const clauses = paragraph.split(/[。！？]/).filter(Boolean);
    return clauses.some((clause, index) => {
      if (
        !/(?:データ|明細|記録|取引).*(?:ありません|ない|見つかりません|確認できませんでした)/.test(
          clause,
        )
      ) {
        return false;
      }
      if (
        /(?:ありません|ない)(?:わけ)?では(?:ありません|ない)|(?:ありません|ない)(?:とは|か)?(?:断定|確認)できません|(?:ない|見つからない)かもしれません/.test(
          clause,
        )
      ) {
        return false;
      }
      const scope = `${clauses[index - 1] ?? ""}。${clause}`;
      if (!facts.every((fact) => hasUnnegatedScopeFact(scope, fact))) return false;

      const expectedPeriods = facts.filter((fact) => /\d{4}年\d{1,2}月/.test(fact)).map(normalize);
      const claimedPeriods = [...clause.matchAll(/\d{4}年\d{1,2}月/g)].map((match) =>
        normalize(match[0]),
      );
      return claimedPeriods.every((period) => expectedPeriods.includes(period));
    });
  });
}

function getDisclosedDatabaseTerms(text: string): string[] {
  const patterns = [
    /\b(?:select|from|where|join|sum|count|avg|group_accounts|transactions|amount)\b/gi,
    /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/gi,
    /:[a-z][a-z0-9_]*/gi,
  ];
  return [
    ...new Set(patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[0]))),
  ];
}

function hasUnexpectedNoDataJoin(sql: string): boolean {
  const joins = [
    ...sql.matchAll(
      /\bjoin\s+([a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?((?!on\b)[a-z_][a-z0-9_]*))?\s+on\s+([\s\S]*?)(?=\b(?:join|where|group\s+by|order\s+by|having|limit)\b|$)/gi,
    ),
  ];
  const joinCount = [...sql.matchAll(/\bjoin\b/gi)].length;
  return (
    joins.length !== joinCount ||
    joins.some(
      (match) =>
        match[1]!.toLocaleLowerCase() !== "group_accounts" ||
        !/\b[a-z_][a-z0-9_]*\.account_id\s*=\s*[a-z_][a-z0-9_]*\.account_id\b/i.test(match[3]!),
    )
  );
}

function hasUnexpectedNoDataPredicate(input: unknown): boolean {
  const query = databaseQueryInputSchema.safeParse(input);
  if (!query.success) return true;
  const executableSql = getExecutableSql(query.data.sql);
  if (/\b(?:except|having|intersect|not|offset)\b/i.test(executableSql)) return true;
  if (/\blimit\s+(?:0\b|:[a-z_][a-z0-9_]*|\?)/i.test(executableSql)) return true;
  if (
    /(?:\b\d+(?:\.\d+)?\b|'[^']*')\s+is\s+null\b|\bnull\s+is\s+not\s+null\b/i.test(executableSql)
  ) {
    return true;
  }
  if (
    /(?<![\w.])(?:-?\d+(?:\.\d+)?|'[^']*')\s+(?:not\s+)?(?:in\s*\(|between\s+(?:-?\d+(?:\.\d+)?|'[^']*')\s+and\s+(?:-?\d+(?:\.\d+)?|'[^']*'))/i.test(
      executableSql,
    )
  ) {
    return true;
  }
  const hasFalseConstantComparison = [
    ...executableSql.matchAll(
      /(?<![\w.])(-?\d+(?:\.\d+)?)\s*(=|!=|<>|<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)(?![\w.])/g,
    ),
  ].some((match) => {
    const left = Number(match[1]);
    const right = Number(match[3]);
    switch (match[2]) {
      case "=":
        return left !== right;
      case "!=":
      case "<>":
        return left === right;
      case "<":
        return left >= right;
      case "<=":
        return left > right;
      case ">":
        return left <= right;
      case ">=":
        return left < right;
      default:
        return false;
    }
  });
  if (hasFalseConstantComparison) return true;
  if (hasUnexpectedNoDataJoin(executableSql)) return true;
  const whereClause = executableSql.match(
    /\bwhere\b([\s\S]*?)(?:\bgroup\s+by\b|\border\s+by\b|$)/i,
  );
  if (!whereClause) return true;

  const allowedColumns = new Set([
    "date",
    "category",
    "group_id",
    "is_transfer",
    "is_internal_transfer",
    "is_excluded_from_calculation",
    "type",
  ]);
  const allowedDateFunctions = new Set(["strftime", "substr"]);
  const whereSql = whereClause[1]!;
  if (
    /\b(?:is_transfer|is_internal_transfer|is_excluded_from_calculation)\b\s*=\s*(?:1|true)\b/i.test(
      whereSql,
    )
  ) {
    return true;
  }
  const hasUnexpectedFunction = [...whereSql.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/gi)].some(
    (match) => {
      const name = match[1]!.toLocaleLowerCase();
      if (name === "in") return false;
      const argumentsText = whereSql
        .slice(match.index! + match[0].length)
        .match(/^([^()]*)\)/)?.[1];
      return !allowedDateFunctions.has(name) || !argumentsText || !/\bdate\b/i.test(argumentsText);
    },
  );
  if (hasUnexpectedFunction) return true;

  return [
    ...whereClause[1]!.matchAll(
      /\b([a-z_][a-z0-9_.]*)\s*(?:=|<>|!=|<=|>=|<|>|\bis\b|\blike\b|\bin\b|\bbetween\b)/gi,
    ),
  ].some((match) => !allowedColumns.has(match[1]!.split(".").at(-1)!.toLocaleLowerCase()));
}

function hasEmptyAggregateResult(input: unknown, row: Record<string, unknown>): boolean {
  const query = databaseQueryInputSchema.safeParse(input);
  if (!query.success) return false;
  const aggregateFields = getTopLevelSelectExpressions(getExecutableSql(query.data.sql)).flatMap<{
    alias: string;
    kind: "count" | "sum";
  }>((expression) => {
    const alias = expression.match(/\s+(?:as\s+)?([a-z_][a-z0-9_]*)\s*$/i)?.[1];
    if (!alias) return [];
    const aggregate = expression.replace(/\s+(?:as\s+)?[a-z_][a-z0-9_]*\s*$/i, "").trim();
    if (/^count\s*\(\s*\*\s*\)$/i.test(aggregate)) return [{ alias, kind: "count" }];
    if (
      /^(?:coalesce\s*\(\s*)?sum\s*\(\s*(?:[a-z_][a-z0-9_.]*\.)?amount\s*\)(?:\s*,\s*0\s*\))?$/i.test(
        aggregate,
      )
    ) {
      return [{ alias, kind: "sum" }];
    }
    return [];
  });
  if (aggregateFields.length === 0) return false;

  return aggregateFields.every(({ alias, kind }) => {
    const entry = Object.entries(row).find(
      ([key]) => key.toLocaleLowerCase() === alias.toLocaleLowerCase(),
    );
    if (!entry) return false;
    return kind === "count" ? Number(entry[1]) === 0 : entry[1] == null || Number(entry[1]) === 0;
  });
}

function hasNoDataEvidence(
  queries: Array<{ input: unknown; output: unknown }>,
  requiredPatterns: string[],
  forbiddenPatterns: string[],
): boolean {
  const relevantQueries = queries.filter(
    ({ input }) =>
      !hasUnexpectedNoDataPredicate(input) &&
      matchesDatabaseQuery(input, requiredPatterns, forbiddenPatterns),
  );
  return (
    relevantQueries.length > 0 &&
    relevantQueries.every(({ input, output }) => {
      const result = databaseResultSchema.safeParse(output);
      if (!result.success || result.data.truncated === true) return false;

      if (result.data.rows.length === 0) return true;
      if (result.data.rows.length !== 1) return false;
      return hasEmptyAggregateResult(input, result.data.rows[0]!);
    })
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
  const factualText = getFactualText(actual.text);
  const normalizedPolicyText = normalize(actual.text);
  const forbiddenTerms = (config.forbiddenTextTerms ?? []).filter((term) =>
    normalizedPolicyText.toLocaleLowerCase().includes(normalize(term).toLocaleLowerCase()),
  );
  if (forbiddenTerms.length > 0) {
    return fail(`本文に禁止用語があります: ${forbiddenTerms.join(", ")}`);
  }
  const disclosedDatabaseTerms = getDisclosedDatabaseTerms(actual.text);
  if (disclosedDatabaseTerms.length > 0) {
    return fail(`本文にDB内部用語があります: ${disclosedDatabaseTerms.join(", ")}`);
  }
  const policyText = [actual.text, ...actual.charts.map(({ title }) => title)].join("\n");
  if (encouragesExternalSharing(policyText) || encouragesUnsafeFinanceAction(policyText)) {
    return fail("外部共有または高リスクな金融行動を促す表現があります。");
  }

  const missingFacts = (config.expectedTextFacts ?? []).filter(
    (fact) => !hasAffirmedFact(factualText, fact),
  );
  if (missingFacts.length > 0) {
    return fail(`本文に期待する事実がありません: ${missingFacts.join(", ")}`);
  }

  const missingPairs = getMissingTextPairs(factualText, config.expectedTextPairs ?? []);
  if (missingPairs.length > 0) {
    return fail(
      `本文のラベルと値が一致しません: ${missingPairs.map((pair) => pair.join("=")).join(", ")}`,
    );
  }

  const scopedPairs = config.expectedScopedTextPairs;
  if (
    scopedPairs &&
    !getTextScopes(factualText, scopedPairs.scopeFact).some(
      (scope) => getMissingTextPairs(scope, scopedPairs.pairs).length === 0,
    )
  ) {
    return fail(`本文の${scopedPairs.scopeFact}と期待する値が同じ範囲にありません。`);
  }

  const missingPatterns = (config.expectedTextPatterns ?? []).filter(
    (pattern) => !new RegExp(pattern, "s").test(factualText),
  );
  if (missingPatterns.length > 0) {
    return fail(`本文が期待する表現に一致しません: ${missingPatterns.join(", ")}`);
  }
  const noDataFacts = config.expectedNoDataTextFacts ?? [];
  if (noDataFacts.length > 0 && !hasScopedNoDataStatement(factualText, noDataFacts)) {
    return fail("データなし回答の期間または対象が期待と異なります。");
  }
  if (noDataFacts.length > 0 && contradictsNoDataConclusion(factualText, noDataFacts)) {
    return fail("データなし回答と矛盾する記述があります。");
  }

  if (config.forbidAmounts && getDisplayedAmounts(factualText).length > 0) {
    return fail("データのない回答に金額が含まれています。");
  }

  const expectedDatabaseValues = config.expectedDatabaseValues ?? [];
  const expectedNumericLiteralPatterns = expectedDatabaseValues
    .map(normalize)
    .filter((value) => /^\d+$/.test(value))
    .map((value) => `(?<!\\d)${value}(?!\\d)`);
  const unsafeNumericExpressionPatterns =
    expectedDatabaseValues.length === 0
      ? []
      : [
          "\\b0x[0-9a-f]+\\b",
          "\\b\\d+(?:\\.\\d+)?e[+-]?\\d+\\b",
          "\\bcast\\s*\\(\\s*['\"]?[+-]?\\d",
          "\\b(?:char|concat|concat_ws|format|hex|printf|quote|unicode|unhex)\\s*\\(",
          "\\|\\|",
          "\\bselect\\b(?:(?!\\bfrom\\b)[\\s\\S])*?\\d[\\d_]*(?:\\.\\d+)?\\s*(?:/|%|\\*|<<|>>|&|\\|)\\s*\\d(?:(?!\\bfrom\\b)[\\s\\S])*?\\bfrom\\b",
          "\\b[a-z_][a-z0-9_.]*\\s*\\*\\s*0\\b",
          "\\b0\\s*\\*\\s*[a-z_][a-z0-9_.]*\\b",
          "\\bselect\\b(?:(?!\\bfrom\\b)[\\s\\S])*?(?:\\+|-)\\s*\\d+(?:\\.\\d+)?(?:(?!\\bfrom\\b)[\\s\\S])*?\\bfrom\\b",
          "\\bselect\\b(?:(?!\\bfrom\\b)[\\s\\S])*?\\bsum\\s*\\(([^)]*)\\)\\s*-\\s*sum\\s*\\(\\1\\)(?:(?!\\bfrom\\b)[\\s\\S])*?\\bfrom\\b",
        ];
  const databaseRows = getDatabaseRows(
    actual.databaseQueries,
    config.requiredDatabaseQueryPatterns ?? [],
    [
      ...(config.forbiddenDatabaseQueryPatterns ?? []),
      ...expectedNumericLiteralPatterns,
      ...unsafeNumericExpressionPatterns,
    ],
    config.requiredDatabaseAggregateAliases ?? [],
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
    if (!Array.isArray(expectedRow)) {
      return !databaseRows.some((row) =>
        Object.entries(expectedRow).every(([expectedKey, expectedValue]) =>
          Object.entries(row).some(
            ([key, value]) =>
              normalize(key) === normalize(expectedKey) &&
              normalize(String(value)) === normalize(expectedValue),
          ),
        ),
      );
    }
    const expectedValues = expectedRow.map(normalize);
    return !databaseRows.some((row) => {
      const values = Object.values(row).map((value) => normalize(String(value)));
      return expectedValues.every((value) => values.includes(value));
    });
  });
  if (missingDatabaseRows.length > 0) {
    return fail(`DB結果に期待する行がありません: ${JSON.stringify(missingDatabaseRows)}`);
  }
  if (config.allowOnlyGroundedAmounts) {
    const allowedAmounts = new Set([
      ...(config.expectedDatabaseValues ?? []).map(normalize),
      ...(config.expectedTextPairs ?? []).map(([, value]) => normalize(value)),
    ]);
    const unexpectedAmounts = getDisplayedAmounts(factualText).filter(
      (amount) => !allowedAmounts.has(amount),
    );
    if (unexpectedAmounts.length > 0) {
      return fail(`本文に根拠のない金額があります: ${[...new Set(unexpectedAmounts)].join(", ")}`);
    }
    const amountsByLabel = new Map<string, Set<string>>();
    for (const [label, value] of config.expectedTextPairs ?? []) {
      const values = amountsByLabel.get(normalize(label)) ?? new Set<string>();
      values.add(normalize(value));
      amountsByLabel.set(normalize(label), values);
    }
    const mislabeledClaims = getLabeledAmountClaims(factualText).filter(
      ({ amount, label }) => !amountsByLabel.get(label)?.has(amount),
    );
    if (mislabeledClaims.length > 0) {
      return fail(
        `本文の金額ラベルに根拠がありません: ${mislabeledClaims
          .map(({ amount, label }) => `${label}=${amount}`)
          .join(", ")}`,
      );
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
    const unsupportedPercentages = getDisplayedPercentages(factualText).filter(
      (percentage) =>
        !expectedPercentages.some((expected) => Math.abs(expected - percentage) <= 0.51),
    );
    if (unsupportedPercentages.length > 0) {
      return fail(`本文にchartと一致しない割合があります: ${unsupportedPercentages.join(", ")}`);
    }
    if (hasInvalidLabeledChartPercentage(factualText, actual.charts)) {
      return fail("本文のlabelと割合がchartと一致しません。");
    }
  }
  if (config.validateChartAmounts && hasInvalidChartAmount(factualText, actual.charts)) {
    return fail("本文のlabelと金額がchartと一致しません。");
  }
  if (config.validateChartComparisons && hasInvalidChartComparison(factualText, actual.charts)) {
    return fail("本文の最大・最小比較がchartと一致しません。");
  }

  const markdownTables = getMarkdownTables(factualText);
  const expectedMarkdownHeader = config.expectedMarkdownHeader;
  const eligibleMarkdownTables = expectedMarkdownHeader
    ? markdownTables.filter(
        ({ header }) => JSON.stringify(header) === JSON.stringify(expectedMarkdownHeader),
      )
    : markdownTables;
  if (expectedMarkdownHeader && eligibleMarkdownTables.length === 0) {
    return fail("Markdown表のheaderが期待と異なります。");
  }
  const markdownRows = eligibleMarkdownTables.flatMap(({ rows }) => rows);
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
  const invalidLinkLabels = (config.expectedTextLinkLabels ?? []).filter(({ href, pattern }) => {
    const labels = actual.textLinkLabels.filter((link) => link.href === href);
    return (
      labels.length === 0 ||
      labels.some(
        (link) =>
          !new RegExp(pattern).test(link.label) ||
          /(?:ではなく|ではない|ではありません|でない|じゃない|断定できません|確認できません)/.test(
            link.label,
          ),
      )
    );
  });
  if (invalidLinkLabels.length > 0) {
    return fail("本文linkの表示labelが期待と異なります。");
  }

  return { pass: true, reason: "期待するfinance chat出力です。", score: 1 };
}
