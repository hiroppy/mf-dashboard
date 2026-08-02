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

const DEFAULT_OPTIONS = {
  lookbackMonths: 12,
  dateDriftDays: 3,
  amountToleranceRatio: 0.1,
  descriptionSimilarityThreshold: 0.8,
  largeIncomeThreshold: 100_000,
} satisfies Required<GenerateRecurringCandidatesOptions>;

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
    classification: "executive_compensation",
    japanese: ["役員報酬"],
    english: ["executive compensation"],
  },
  { classification: "salary", japanese: ["給与", "給料"], english: ["salary", "payroll"] },
  { classification: "rent", japanese: ["家賃", "賃料"], english: ["rent"] },
  { classification: "loan", japanese: ["ローン", "返済"], english: ["loan"] },
  { classification: "card", japanese: ["カード"], english: ["card"] },
  {
    classification: "tax",
    japanese: ["予定納税", "税金", "納税", "税・社会保障", "所得税", "住民税"],
    english: ["tax"],
  },
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
    .replace(/(?<![0-9])(?:[0-9]{4}年)?(?:0?[1-9]|1[0-2])月(?:分)?(?![0-9])/gu, "")
    .replace(/(^|[^a-z0-9])[0-9]{4}[-/.]?(?:0[1-9]|1[0-2])(?=$|[^a-z0-9])/gu, "$1")
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
  if (left === right) return 1;
  if (!left || !right) return 0;

  const leftBigrams = getBigrams(left);
  const rightBigrams = getBigrams(right);
  let overlap = 0;
  for (const bigram of leftBigrams) {
    if (rightBigrams.has(bigram)) overlap++;
  }
  return (2 * overlap) / (leftBigrams.size + rightBigrams.size);
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function isWithinAmountTolerance(left: number, right: number, tolerance: number): boolean {
  return Math.abs(left - right) / Math.max(left, right) <= tolerance;
}

function daysFromMonthEnd(transaction: NormalizedTransaction): number {
  const { year, month } = parseIsoDateKey(transaction.date);
  return getDaysInMonth(year, month) - transaction.day;
}

function calendarDayDistance(left: NormalizedTransaction, right: NormalizedTransaction): number {
  const directDistance = Math.abs(left.day - right.day);
  const [earlyMonth, lateMonth] = left.day <= right.day ? [left, right] : [right, left];
  const boundaryDistance = daysFromMonthEnd(lateMonth) + earlyMonth.day;
  return Math.min(directDistance, boundaryDistance);
}

function belongsToGroup(
  transaction: NormalizedTransaction,
  group: TransactionGroup,
  options: Required<GenerateRecurringCandidatesOptions>,
): boolean {
  const monthlyTransactions = deduplicateMonths(group.transactions);
  const representative = monthlyTransactions.at(-1);
  if (!representative) return false;
  if (
    transaction.accountId !== representative.accountId ||
    transaction.type !== representative.type ||
    transaction.classification !== representative.classification
  ) {
    return false;
  }

  const medianDayDistance = median(
    monthlyTransactions.map((existing) => calendarDayDistance(transaction, existing)),
  );
  const medianAmount = median(monthlyTransactions.map(({ amount }) => amount));
  return (
    medianDayDistance <= options.dateDriftDays &&
    isWithinAmountTolerance(transaction.amount, medianAmount, options.amountToleranceRatio) &&
    calculateDescriptionSimilarity(
      transaction.normalizedDescription,
      representative.normalizedDescription,
    ) >= options.descriptionSimilarityThreshold
  );
}

function groupTransactions(
  transactions: NormalizedTransaction[],
  options: Required<GenerateRecurringCandidatesOptions>,
): TransactionGroup[] {
  const groups: TransactionGroup[] = [];
  for (const transaction of transactions) {
    const existingGroup = groups.find((group) => belongsToGroup(transaction, group, options));
    if (existingGroup) {
      existingGroup.transactions.push(transaction);
    } else {
      groups.push({ transactions: [transaction] });
    }
  }
  return groups;
}

function deduplicateMonths(transactions: NormalizedTransaction[]): NormalizedTransaction[] {
  const byMonth = new Map<string, NormalizedTransaction>();
  for (const transaction of transactions) {
    if (!byMonth.has(transaction.month)) byMonth.set(transaction.month, transaction);
  }
  return [...byMonth.values()];
}

function getConfidence(
  occurrences: NormalizedTransaction[],
  previousMonth: string,
  largeIncomeThreshold: number,
): RecurringCandidateConfidence | null {
  const latest = occurrences.at(-1);
  if (latest?.month !== previousMonth) return null;
  if (occurrences.length >= 3) return "high";
  if (occurrences.length === 2) return "medium";

  if (latest.type === "income" && latest.amount >= largeIncomeThreshold) {
    return "low";
  }
  return null;
}

function compareTextKeys(keys: Array<[string, string]>): number {
  for (const [left, right] of keys) {
    const result = left.localeCompare(right);
    if (result !== 0) return result;
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
  const occurrences = deduplicateMonths(group.transactions);
  const confidence = getConfidence(
    occurrences,
    shiftYearMonthKey(targetMonth, -1),
    options.largeIncomeThreshold,
  );
  if (!confidence) return null;

  const latest = occurrences.at(-1);
  if (!latest || latest.type === "transfer") return null;

  const { year, month } = parseYearMonthKey(targetMonth);
  const targetMonthDays = getDaysInMonth(year, month);
  const hasMonthStartOccurrence = occurrences.some(
    (occurrence) => occurrence.day <= options.dateDriftDays,
  );
  const hasMonthEndOccurrence = occurrences.some(
    (occurrence) => daysFromMonthEnd(occurrence) <= options.dateDriftDays,
  );
  const allExactMonthEnd = occurrences.every((occurrence) => daysFromMonthEnd(occurrence) === 0);
  const isMonthBoundaryPattern =
    allExactMonthEnd ||
    (hasMonthStartOccurrence &&
      hasMonthEndOccurrence &&
      occurrences.every(
        (occurrence) =>
          occurrence.day <= options.dateDriftDays ||
          daysFromMonthEnd(occurrence) <= options.dateDriftDays,
      ));
  const predictedDay = isMonthBoundaryPattern
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
        normalizedDescription: normalizeDescription(transaction.description),
      };
    })
    .filter(({ month }) => month >= firstHistoryMonth && month < targetMonth)
    .sort(compareTransactions);

  return groupTransactions(history, options)
    .map((group) => createCandidate(group, targetMonth, options))
    .filter((candidate): candidate is RecurringCandidate => candidate !== null)
    .sort(compareCandidates);
}
