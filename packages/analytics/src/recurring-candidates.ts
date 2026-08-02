import {
  formatIsoDateKey,
  getDaysInMonth,
  parseIsoDateKey,
  parseYearMonthKey,
  shiftYearMonthKey,
} from "@mf-dashboard/date-utils";

export type RecurringCandidateClassification =
  | "card"
  | "rent"
  | "loan"
  | "salary"
  | "executive_compensation"
  | "tax"
  | "other";

export type RecurringCandidateConfidence = "high" | "medium" | "low";

export interface RecurringTransaction {
  accountId: string | number;
  date: string;
  description?: string | null;
  category?: string | null;
  subCategory?: string | null;
  amount: number;
  type: "income" | "expense" | "transfer";
  isTransfer?: boolean;
  isExcludedFromCalculation?: boolean;
}

export interface RecurringCandidateEvidence {
  lookbackMonths: number;
  occurrenceCount: number;
  dateRange: {
    from: string;
    to: string;
  };
  amountRange: {
    min: number;
    max: number;
  };
}

export interface RecurringCandidate {
  accountId: string | number;
  type: "income" | "expense";
  classification: RecurringCandidateClassification;
  confidence: RecurringCandidateConfidence;
  description: string | null;
  predictedDate: string;
  predictedAmount: number;
  evidence: RecurringCandidateEvidence;
}

export interface GenerateRecurringCandidatesOptions {
  lookbackMonths?: number;
  dateDriftDays?: number;
  amountToleranceRatio?: number;
  descriptionSimilarityThreshold?: number;
  largeIncomeThreshold?: number;
}

interface NormalizedTransaction extends RecurringTransaction {
  amount: number;
  classification: RecurringCandidateClassification;
  day: number;
  month: string;
  normalizedDescription: string;
}

interface TransactionGroup {
  transactions: NormalizedTransaction[];
}

interface GroupPartition {
  anchorBigramCounts: Map<TransactionGroup, number>;
  groups: TransactionGroup[];
  groupsByBigram: Map<string, Set<TransactionGroup>>;
}

const DEFAULT_OPTIONS = {
  lookbackMonths: 12,
  dateDriftDays: 3,
  amountToleranceRatio: 0.1,
  descriptionSimilarityThreshold: 0.8,
  largeIncomeThreshold: 100_000,
} satisfies Required<GenerateRecurringCandidatesOptions>;

const MONTH_BOUNDARY_WINDOW_DAYS = 3;
const GENERIC_DESCRIPTIONS = new Set(["payment", "振込", "支払", "支払い"]);

function assertRatio(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1`);
  }
}

function resolveOptions(
  options: GenerateRecurringCandidatesOptions,
): Required<GenerateRecurringCandidatesOptions> {
  const resolved = {
    lookbackMonths: options.lookbackMonths ?? DEFAULT_OPTIONS.lookbackMonths,
    dateDriftDays: options.dateDriftDays ?? DEFAULT_OPTIONS.dateDriftDays,
    amountToleranceRatio: options.amountToleranceRatio ?? DEFAULT_OPTIONS.amountToleranceRatio,
    descriptionSimilarityThreshold:
      options.descriptionSimilarityThreshold ?? DEFAULT_OPTIONS.descriptionSimilarityThreshold,
    largeIncomeThreshold: options.largeIncomeThreshold ?? DEFAULT_OPTIONS.largeIncomeThreshold,
  };

  if (
    !Number.isInteger(resolved.lookbackMonths) ||
    resolved.lookbackMonths < 1 ||
    resolved.lookbackMonths > 12
  ) {
    throw new Error("lookbackMonths must be an integer between 1 and 12");
  }
  if (!Number.isInteger(resolved.dateDriftDays) || resolved.dateDriftDays < 0) {
    throw new Error("dateDriftDays must be a non-negative integer");
  }
  assertRatio(resolved.amountToleranceRatio, "amountToleranceRatio");
  assertRatio(resolved.descriptionSimilarityThreshold, "descriptionSimilarityThreshold");
  if (!Number.isFinite(resolved.largeIncomeThreshold) || resolved.largeIncomeThreshold < 0) {
    throw new Error("largeIncomeThreshold must be a non-negative finite number");
  }
  return resolved;
}

const classificationRules: ReadonlyArray<{
  classification: Exclude<RecurringCandidateClassification, "other">;
  japanese: readonly string[];
  english: readonly string[];
}> = [
  {
    classification: "tax",
    japanese: ["予定納税", "税金", "納税", "税・社会保障", "所得税", "住民税"],
    english: ["tax"],
  },
  {
    classification: "executive_compensation",
    japanese: ["役員報酬"],
    english: ["executive compensation"],
  },
  { classification: "salary", japanese: ["給与", "給料"], english: ["salary", "payroll"] },
  { classification: "rent", japanese: ["家賃", "賃料"], english: ["rent"] },
  { classification: "loan", japanese: ["ローン", "返済"], english: ["loan"] },
  { classification: "card", japanese: ["カード"], english: ["card"] },
];

function normalizeCaseAndWidth(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").toLowerCase();
}

function containsEnglishTerm(text: string, term: string): boolean {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapedTerm}(?=$|[^a-z0-9])`).test(text);
}

function normalizeDescription(value: string | null | undefined): string {
  return normalizeCaseAndWidth(value)
    .replace(
      /(?<![0-9])(?:(?:19|20)[0-9]{2}年)?(?:0?[1-9]|1[0-2])月(?:(?:0?[1-9]|[12][0-9]|3[01])日|分)?(?![0-9])/gu,
      "",
    )
    .replace(
      /(^|[^a-z0-9])(?:19|20)[0-9]{2}(?:[-/.](?:0?[1-9]|1[0-2])(?:[-/.](?:0?[1-9]|[12][0-9]|3[01]))?|(?:0[1-9]|1[0-2]))(?=$|[^a-z0-9])/gu,
      "$1",
    )
    .replace(
      /\b(invoice|authorization|auth|reference|ref)(?:\s*(?:no\.?|number))?\s*[:#-]?\s*[0-9]+\b/gu,
      "$1",
    )
    .replace(/(?<=[0-9])[\p{Punctuation}\p{Separator}\p{Symbol}]+(?=[0-9])/gu, " numsep ")
    .replace(/[\p{Punctuation}\p{Separator}\p{Symbol}]/gu, "");
}

export function classifyRecurringTransaction(
  transaction: Pick<RecurringTransaction, "category" | "subCategory" | "description">,
): RecurringCandidateClassification {
  const searchableText = normalizeCaseAndWidth(
    [transaction.category, transaction.subCategory, transaction.description]
      .filter(Boolean)
      .join(" "),
  );

  return (
    classificationRules.find(
      ({ japanese, english }) =>
        japanese.some((term) => searchableText.includes(term)) ||
        english.some((term) => containsEnglishTerm(searchableText, term)),
    )?.classification ?? "other"
  );
}

function getBigrams(value: string): Set<string> {
  if (value.length < 2) return new Set([value]);
  return new Set(
    Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)),
  );
}

function calculateDescriptionSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftBigrams = getBigrams(left);
  const rightBigrams = getBigrams(right);
  let overlap = 0;
  for (const bigram of leftBigrams) {
    if (rightBigrams.has(bigram)) overlap++;
  }
  const similarity = (2 * overlap) / (leftBigrams.size + rightBigrams.size);
  return similarity === 1 ? 1 - Number.EPSILON : similarity;
}

function haveMatchingNumericTokens(left: string, right: string): boolean {
  const numericTokens = (value: string) => value.match(/[0-9]+/g) ?? [];
  return numericTokens(left).join("\0") === numericTokens(right).join("\0");
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function daysFromMonthEnd(transaction: NormalizedTransaction): number {
  const { year, month } = parseIsoDateKey(transaction.date);
  return getDaysInMonth(year, month) - transaction.day;
}

function calendarDayDistance(left: NormalizedTransaction, right: NormalizedTransaction): number {
  if (daysFromMonthEnd(left) === 0 && daysFromMonthEnd(right) === 0) return 0;
  const directDistance = Math.abs(left.day - right.day);
  const [earlier, later] = left.date <= right.date ? [left, right] : [right, left];
  if (earlier.month === later.month || earlier.day <= later.day) return directDistance;

  const crossesRecognizedBoundary =
    daysFromMonthEnd(earlier) <= MONTH_BOUNDARY_WINDOW_DAYS &&
    later.day <= MONTH_BOUNDARY_WINDOW_DAYS;
  if (!crossesRecognizedBoundary) return directDistance;

  const boundaryDistance = daysFromMonthEnd(earlier) + later.day;
  return Math.min(directDistance, boundaryDistance);
}

function boundaryPosition(
  transaction: NormalizedTransaction,
): { occurrenceMonth: string; side: "start" | "end" } | null {
  if (transaction.day <= MONTH_BOUNDARY_WINDOW_DAYS) {
    return { occurrenceMonth: shiftYearMonthKey(transaction.month, -1), side: "start" };
  }
  if (daysFromMonthEnd(transaction) <= MONTH_BOUNDARY_WINDOW_DAYS) {
    return { occurrenceMonth: transaction.month, side: "end" };
  }
  return null;
}

function conflictsWithBoundaryOccurrence(
  transaction: NormalizedTransaction,
  transactions: NormalizedTransaction[],
): boolean {
  const position = boundaryPosition(transaction);
  if (!position) return false;
  return transactions.some((existing) => {
    const existingPosition = boundaryPosition(existing);
    return (
      existingPosition?.occurrenceMonth === position.occurrenceMonth &&
      existingPosition.side !== position.side
    );
  });
}

function conflictsWithPostingMonthSchedule(
  transaction: NormalizedTransaction,
  transactions: NormalizedTransaction[],
): boolean {
  return transactions.some((existing) => {
    if (existing.month !== transaction.month || existing.day === transaction.day) return false;
    const existingPosition = boundaryPosition(existing);
    const transactionPosition = boundaryPosition(transaction);
    return !(
      existingPosition &&
      transactionPosition &&
      existingPosition.occurrenceMonth !== transactionPosition.occurrenceMonth
    );
  });
}

function normalizeGroupingText(transaction: RecurringTransaction): string {
  const description = normalizeDescription(transaction.description);
  const normalizeCategoryPart = (value: string | null | undefined) =>
    normalizeCaseAndWidth(value).replace(/[\p{Punctuation}\p{Separator}\p{Symbol}]/gu, "");
  const categoryParts = [transaction.category, transaction.subCategory].map(normalizeCategoryPart);
  const category = categoryParts.some(Boolean) ? categoryParts.join("categorysep") : "";
  if (!description) return category;
  if (!GENERIC_DESCRIPTIONS.has(description)) return description;
  return category ? `${description}descriptionsep${category}` : "";
}

interface GroupMatchScore {
  amountDistance: number;
  dateDistance: number;
  descriptionDistance: number;
}

function getGroupMatchScore(
  transaction: NormalizedTransaction,
  group: TransactionGroup,
  options: Required<GenerateRecurringCandidatesOptions>,
): GroupMatchScore | null {
  const monthlyTransactions = deduplicateMonths(group.transactions);
  const representative = monthlyTransactions.at(-1);
  if (!representative) return null;
  if (!transaction.normalizedDescription || !representative.normalizedDescription) return null;
  if (
    transaction.accountId !== representative.accountId ||
    transaction.type !== representative.type ||
    transaction.classification !== representative.classification
  ) {
    return null;
  }
  if (conflictsWithBoundaryOccurrence(transaction, group.transactions)) return null;
  if (conflictsWithPostingMonthSchedule(transaction, group.transactions)) return null;

  const dayDistances = monthlyTransactions.map((existing) =>
    calendarDayDistance(transaction, existing),
  );
  const allWithinBoundaryWindow = [transaction, ...monthlyTransactions].every(
    (item) => boundaryPosition(item) !== null,
  );
  const groupDayDistance = allWithinBoundaryWindow
    ? Math.min(...dayDistances)
    : median(dayDistances);
  const medianAmount = median(monthlyTransactions.map(({ amount }) => amount));
  const amountDistance =
    Math.abs(transaction.amount - medianAmount) / Math.max(transaction.amount, medianAmount);
  const descriptionSimilarities = monthlyTransactions.map((existing) =>
    calculateDescriptionSimilarity(
      transaction.normalizedDescription,
      existing.normalizedDescription,
    ),
  );
  const descriptionSimilarity = Math.min(...descriptionSimilarities);
  if (
    groupDayDistance > options.dateDriftDays ||
    amountDistance > options.amountToleranceRatio ||
    !monthlyTransactions.every((existing) =>
      haveMatchingNumericTokens(transaction.normalizedDescription, existing.normalizedDescription),
    ) ||
    descriptionSimilarity < options.descriptionSimilarityThreshold
  ) {
    return null;
  }
  return {
    amountDistance,
    dateDistance: groupDayDistance,
    descriptionDistance: 1 - descriptionSimilarity,
  };
}

function compareGroupMatchScores(left: GroupMatchScore, right: GroupMatchScore): number {
  return (
    left.dateDistance - right.dateDistance ||
    left.amountDistance - right.amountDistance ||
    left.descriptionDistance - right.descriptionDistance
  );
}

function getIndexedGroups(
  partition: GroupPartition,
  transactionBigrams: Set<string>,
  similarityThreshold: number,
): TransactionGroup[] {
  if (similarityThreshold === 0) return partition.groups;

  const overlapCounts = new Map<TransactionGroup, number>();
  for (const bigram of transactionBigrams) {
    for (const group of partition.groupsByBigram.get(bigram) ?? []) {
      overlapCounts.set(group, (overlapCounts.get(group) ?? 0) + 1);
    }
  }
  return [...overlapCounts]
    .filter(([group, overlap]) => {
      const anchorBigramCount = partition.anchorBigramCounts.get(group) ?? 0;
      return (2 * overlap) / (transactionBigrams.size + anchorBigramCount) >= similarityThreshold;
    })
    .map(([group]) => group);
}

function groupTransactions(
  transactions: NormalizedTransaction[],
  options: Required<GenerateRecurringCandidatesOptions>,
): TransactionGroup[] {
  const partitions = new Map<string, GroupPartition>();
  for (const transaction of transactions) {
    const numericTokenKey = (transaction.normalizedDescription.match(/[0-9]+/g) ?? []).join(".");
    const exactDescriptionKey = transaction.normalizedDescription.includes("categorysep")
      ? transaction.normalizedDescription
      : "";
    const partitionKey = [
      accountIdKey(transaction.accountId),
      transaction.type,
      transaction.classification,
      numericTokenKey,
      exactDescriptionKey,
    ].join("\0");
    const partition: GroupPartition = partitions.get(partitionKey) ?? {
      anchorBigramCounts: new Map(),
      groups: [],
      groupsByBigram: new Map(),
    };
    const transactionBigrams = getBigrams(transaction.normalizedDescription);
    const candidateGroups = getIndexedGroups(
      partition,
      transactionBigrams,
      options.descriptionSimilarityThreshold,
    );
    let bestMatch: { group: TransactionGroup; score: GroupMatchScore } | undefined;
    for (const group of candidateGroups) {
      const score = getGroupMatchScore(transaction, group, options);
      if (score && (!bestMatch || compareGroupMatchScores(score, bestMatch.score) < 0)) {
        bestMatch = { group, score };
      }
    }
    const existingGroup = bestMatch?.group;
    if (existingGroup) {
      existingGroup.transactions.push(transaction);
    } else {
      const group = { transactions: [transaction] };
      partition.groups.push(group);
      partition.anchorBigramCounts.set(group, transactionBigrams.size);
      for (const bigram of transactionBigrams) {
        const indexedGroups = partition.groupsByBigram.get(bigram) ?? new Set();
        indexedGroups.add(group);
        partition.groupsByBigram.set(bigram, indexedGroups);
      }
    }
    partitions.set(partitionKey, partition);
  }
  return [...partitions.values()].flatMap(({ groups }) => groups);
}

function deduplicateMonths(transactions: NormalizedTransaction[]): NormalizedTransaction[] {
  const byMonth = new Map<string, NormalizedTransaction>();
  for (const transaction of transactions) {
    if (!byMonth.has(transaction.month)) byMonth.set(transaction.month, transaction);
  }
  return [...byMonth.values()];
}

function isMonthBoundaryPattern(occurrences: NormalizedTransaction[]): boolean {
  const hasMonthStartOccurrence = occurrences.some(
    (occurrence) => occurrence.day <= MONTH_BOUNDARY_WINDOW_DAYS,
  );
  const hasMonthEndOccurrence = occurrences.some(
    (occurrence) => daysFromMonthEnd(occurrence) <= MONTH_BOUNDARY_WINDOW_DAYS,
  );
  const allExactMonthEnd = occurrences.every((occurrence) => daysFromMonthEnd(occurrence) === 0);
  return (
    allExactMonthEnd ||
    (hasMonthStartOccurrence &&
      hasMonthEndOccurrence &&
      occurrences.every(
        (occurrence) =>
          occurrence.day <= MONTH_BOUNDARY_WINDOW_DAYS ||
          daysFromMonthEnd(occurrence) <= MONTH_BOUNDARY_WINDOW_DAYS,
      ))
  );
}

function getOccurrenceMonth(transaction: NormalizedTransaction, boundaryPattern: boolean): string {
  if (!boundaryPattern) return transaction.month;
  return boundaryPosition(transaction)?.occurrenceMonth ?? transaction.month;
}

function deduplicateOccurrences(
  transactions: NormalizedTransaction[],
  boundaryPattern: boolean,
): NormalizedTransaction[] {
  const byOccurrenceMonth = new Map<string, NormalizedTransaction>();
  for (const transaction of transactions) {
    const occurrenceMonth = getOccurrenceMonth(transaction, boundaryPattern);
    if (!byOccurrenceMonth.has(occurrenceMonth))
      byOccurrenceMonth.set(occurrenceMonth, transaction);
  }
  return [...byOccurrenceMonth.values()];
}

function getMonthlySuffix(
  occurrences: NormalizedTransaction[],
  boundaryPattern: boolean,
): NormalizedTransaction[] {
  let suffixStart = occurrences.length - 1;
  while (suffixStart > 0) {
    const previousMonth = getOccurrenceMonth(occurrences[suffixStart - 1], boundaryPattern);
    const currentMonth = getOccurrenceMonth(occurrences[suffixStart], boundaryPattern);
    if (shiftYearMonthKey(previousMonth, 1) !== currentMonth) break;
    suffixStart--;
  }
  return occurrences.slice(suffixStart);
}

function getConfidence(
  occurrences: NormalizedTransaction[],
  previousMonth: string,
  largeIncomeThreshold: number,
  boundaryPattern: boolean,
): RecurringCandidateConfidence | null {
  const latest = occurrences.at(-1);
  if (!latest) return null;
  const latestOccurrenceMonth = getOccurrenceMonth(latest, boundaryPattern);
  if (latest.month !== previousMonth && latestOccurrenceMonth !== previousMonth) return null;
  if (occurrences.length >= 3) return "high";
  if (occurrences.length === 2) return "medium";

  if (latest.type === "income" && latest.amount >= largeIncomeThreshold) {
    return "low";
  }
  return null;
}

function compareCodePointStrings(left: string, right: string): number {
  const leftCodePoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightCodePoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftCodePoints.length, rightCodePoints.length); index++) {
    const result = leftCodePoints[index] - rightCodePoints[index];
    if (result !== 0) return result;
  }
  return leftCodePoints.length - rightCodePoints.length;
}

function compareTextKeys(keys: Array<[string, string]>): number {
  for (const [left, right] of keys) {
    const result = left.localeCompare(right);
    if (result !== 0) return result;
    if (left !== right) return compareCodePointStrings(left, right);
  }
  return 0;
}

function accountIdKey(accountId: string | number): string {
  return `${typeof accountId}:${accountId}`;
}

function compareCandidates(left: RecurringCandidate, right: RecurringCandidate): number {
  const textResult = compareTextKeys([
    [left.predictedDate, right.predictedDate],
    [accountIdKey(left.accountId), accountIdKey(right.accountId)],
    [left.description ?? "", right.description ?? ""],
    [left.type, right.type],
    [left.classification, right.classification],
    [left.confidence, right.confidence],
    [left.evidence.dateRange.from, right.evidence.dateRange.from],
    [left.evidence.dateRange.to, right.evidence.dateRange.to],
  ]);
  if (textResult !== 0) return textResult;

  return (
    left.predictedAmount - right.predictedAmount ||
    left.evidence.amountRange.min - right.evidence.amountRange.min ||
    left.evidence.amountRange.max - right.evidence.amountRange.max ||
    left.evidence.occurrenceCount - right.evidence.occurrenceCount
  );
}

function compareTransactions(left: NormalizedTransaction, right: NormalizedTransaction): number {
  const textResult = compareTextKeys([
    [left.date, right.date],
    [accountIdKey(left.accountId), accountIdKey(right.accountId)],
    [left.type, right.type],
    [left.classification, right.classification],
    [left.normalizedDescription, right.normalizedDescription],
    [left.description ?? "", right.description ?? ""],
    [left.category ?? "", right.category ?? ""],
    [left.subCategory ?? "", right.subCategory ?? ""],
  ]);
  return textResult || left.amount - right.amount;
}

function createCandidate(
  group: TransactionGroup,
  targetMonth: string,
  options: Required<GenerateRecurringCandidatesOptions>,
): RecurringCandidate | null {
  const historicalBoundaryPattern = isMonthBoundaryPattern(group.transactions);
  const occurrences = getMonthlySuffix(
    deduplicateOccurrences(group.transactions, historicalBoundaryPattern),
    historicalBoundaryPattern,
  );
  const boundaryPattern = isMonthBoundaryPattern(occurrences);
  const confidence = getConfidence(
    occurrences,
    shiftYearMonthKey(targetMonth, -1),
    options.largeIncomeThreshold,
    boundaryPattern,
  );
  if (!confidence) return null;

  const latest = occurrences.at(-1);
  if (!latest || latest.type === "transfer") return null;

  const { year, month } = parseYearMonthKey(targetMonth);
  const targetMonthDays = getDaysInMonth(year, month);
  const predictedDay = boundaryPattern
    ? targetMonthDays
    : Math.min(Math.round(median(occurrences.map(({ day }) => day))), targetMonthDays);
  const dates = occurrences.map(({ date }) => date).sort();
  const amounts = occurrences.map(({ amount }) => amount);

  return {
    accountId: latest.accountId,
    type: latest.type,
    classification: latest.classification,
    confidence,
    description: latest.description ?? null,
    predictedDate: formatIsoDateKey({ year, month, day: predictedDay }),
    predictedAmount: Math.round(median(amounts)),
    evidence: {
      lookbackMonths: options.lookbackMonths,
      occurrenceCount: occurrences.length,
      dateRange: { from: dates[0], to: dates.at(-1) ?? dates[0] },
      amountRange: { min: Math.min(...amounts), max: Math.max(...amounts) },
    },
  };
}

export function generateRecurringCandidates(
  transactions: RecurringTransaction[],
  targetMonth: string,
  customOptions: GenerateRecurringCandidatesOptions = {},
): RecurringCandidate[] {
  parseYearMonthKey(targetMonth);
  const options = resolveOptions(customOptions);
  const firstHistoryMonth = shiftYearMonthKey(targetMonth, -options.lookbackMonths);

  const history = transactions
    .filter(
      ({ type, amount, isTransfer, isExcludedFromCalculation }) =>
        type !== "transfer" &&
        !isTransfer &&
        !isExcludedFromCalculation &&
        Number.isFinite(amount) &&
        amount !== 0,
    )
    .map((transaction): NormalizedTransaction => {
      const { day } = parseIsoDateKey(transaction.date);
      return {
        ...transaction,
        amount: Math.abs(transaction.amount),
        classification: classifyRecurringTransaction(transaction),
        day,
        month: transaction.date.slice(0, 7),
        normalizedDescription: normalizeGroupingText(transaction),
      };
    })
    .filter(({ month }) => month >= firstHistoryMonth && month < targetMonth)
    .filter(({ normalizedDescription }) => normalizedDescription.length > 0)
    .sort(compareTransactions);

  return groupTransactions(history, options)
    .map((group) => createCandidate(group, targetMonth, options))
    .filter((candidate): candidate is RecurringCandidate => candidate !== null)
    .sort(compareCandidates);
}
