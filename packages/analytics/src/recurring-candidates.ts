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

type AmountGroupsByDay = Map<number, Map<number, Set<TransactionGroup>>>;
type AmountKeysByDay = Map<number, number[]>;

interface GroupPartition {
  amountIndexEntries: Map<TransactionGroup, Array<{ amount: number; day: number }>>;
  amountGroupsByDay: AmountGroupsByDay;
  amountGroupsByDescriptionAndDay: Map<string, AmountGroupsByDay>;
  amountKeysByDay: AmountKeysByDay;
  amountKeysByDescriptionAndDay: Map<string, AmountKeysByDay>;
  anchorBigrams: Map<TransactionGroup, Set<string>>;
  descriptionAmountIndexEntries: Map<
    TransactionGroup,
    Array<{ amount: number; day: number; description: string }>
  >;
  exactOccurrences: Map<string, TransactionGroup>;
  exactRecurringSlots: Map<string, TransactionGroup>;
  groups: TransactionGroup[];
  groupsByBigramAndMonth: Map<string, Map<string, Map<string, Set<TransactionGroup>>>>;
  latestMonths: Map<TransactionGroup, string>;
}

const DEFAULT_OPTIONS = {
  lookbackMonths: 12,
  dateDriftDays: 3,
  amountToleranceRatio: 0.1,
  descriptionSimilarityThreshold: 0.8,
  largeIncomeThreshold: 100_000,
} satisfies Required<GenerateRecurringCandidatesOptions>;

const MONTH_BOUNDARY_WINDOW_DAYS = 3;
const MAX_GROUPS_PER_AMOUNT_BUCKET = 8;
const MAX_FUZZY_CANDIDATE_GROUPS = 64;
const MAX_FUZZY_PRE_SCORE_GROUPS = 256;
const MAX_INELIGIBLE_CURRENT_MONTH_GROUPS = 64;
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
  return new RegExp(
    `(^|[^\\p{Letter}\\p{Number}])${escapedTerm}(?=$|[^\\p{Letter}\\p{Number}])`,
    "u",
  ).test(text);
}

function removeValidCalendarDate(
  match: string,
  prefix: string,
  yearText: string,
  monthText: string,
  dayText: string,
): string {
  return Number(dayText) <= getDaysInMonth(Number(yearText), Number(monthText)) ? prefix : match;
}

function removeValidYearlessJapaneseDate(
  match: string,
  prefix: string,
  monthText: string,
  dayText?: string,
): string {
  const isValid = !dayText || Number(dayText) <= getDaysInMonth(2024, Number(monthText));
  return isValid ? prefix : match;
}

function removeValidSeparatedCalendarDate(
  match: string,
  prefix: string,
  yearText: string,
  _separator: string,
  monthText: string,
  dayText: string,
): string {
  return removeValidCalendarDate(match, prefix, yearText, monthText, dayText);
}

function normalizeDescription(value: string | null | undefined): string {
  return normalizeCaseAndWidth(value)
    .replace(
      /(^|[^a-z0-9])((?:19|20)[0-9]{2})(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])(?=$|[^a-z0-9])/gu,
      removeValidCalendarDate,
    )
    .replace(
      /(^|[^0-9])((?:19|20)[0-9]{2})年(0?[1-9]|1[0-2])月(0?[1-9]|[12][0-9]|3[01])日(?=$|[^0-9])/gu,
      removeValidCalendarDate,
    )
    .replace(
      /(^|[^a-z0-9])((?:19|20)[0-9]{2})([-/.])(0?[1-9]|1[0-2])\3(0?[1-9]|[12][0-9]|3[01])(?=$|[^a-z0-9])/gu,
      removeValidSeparatedCalendarDate,
    )
    .replace(/(?:19|20)[0-9]{2}年(?:0?[1-9]|1[0-2])月(?:分)?(?![0-9])/gu, "")
    .replace(
      /(^|[^0-9年])(0?[1-9]|1[0-2])月(?:(0?[1-9]|[12][0-9]|3[01])日|分)?(?![0-9])/gu,
      removeValidYearlessJapaneseDate,
    )
    .replace(
      /(^|[^a-z0-9])(?:19|20)[0-9]{2}(?:[-/.](?:0?[1-9]|1[0-2])(?![-/.][0-9])|(?:0[1-9]|1[0-2]))(?=$|[^a-z0-9])/gu,
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

  return calculateBigramSimilarity(getBigrams(left), getBigrams(right));
}

function calculateBigramSimilarity(leftBigrams: Set<string>, rightBigrams: Set<string>): number {
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
  const lower = sorted[middle - 1];
  return lower + (sorted[middle] - lower) / 2;
}

function inferFixedCalendarDay(occurrences: NormalizedTransaction[]): number | null {
  if (occurrences.length < 2) return null;
  const fixedDay = Math.max(...occurrences.map(({ day }) => day));
  const isFixedDay = occurrences.every((occurrence) => {
    const { year, month } = parseIsoDateKey(occurrence.date);
    return occurrence.day === Math.min(fixedDay, getDaysInMonth(year, month));
  });
  return isFixedDay ? fixedDay : null;
}

function daysFromMonthEnd(transaction: NormalizedTransaction): number {
  const { year, month } = parseIsoDateKey(transaction.date);
  return getDaysInMonth(year, month) - transaction.day;
}

function calendarDayDistance(left: NormalizedTransaction, right: NormalizedTransaction): number {
  if (left.day === right.day) return 0;
  const leftMonth = parseIsoDateKey(left.date);
  const rightMonth = parseIsoDateKey(right.date);
  const leftMonthDays = getDaysInMonth(leftMonth.year, leftMonth.month);
  const rightMonthDays = getDaysInMonth(rightMonth.year, rightMonth.month);
  if (
    (left.day === leftMonthDays && right.day > leftMonthDays) ||
    (right.day === rightMonthDays && left.day > rightMonthDays)
  ) {
    return 0;
  }
  const leftMonthEndOffset = daysFromMonthEnd(left);
  const rightMonthEndOffset = daysFromMonthEnd(right);
  if (
    leftMonthEndOffset <= MONTH_BOUNDARY_WINDOW_DAYS &&
    rightMonthEndOffset <= MONTH_BOUNDARY_WINDOW_DAYS
  ) {
    return Math.abs(leftMonthEndOffset - rightMonthEndOffset);
  }
  const directDistance = Math.abs(left.day - right.day);
  const [earlier, later] = left.date <= right.date ? [left, right] : [right, left];
  if (earlier.month === later.month) {
    const earlierPosition = boundaryPosition(earlier);
    const laterPosition = boundaryPosition(later);
    if (
      earlierPosition?.side === "start" &&
      earlier.day > 1 &&
      laterPosition?.side === "end" &&
      earlierPosition.occurrenceMonth !== laterPosition.occurrenceMonth
    ) {
      return earlier.day + daysFromMonthEnd(later);
    }
    return directDistance;
  }
  if (earlier.day <= later.day) return directDistance;

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

function getPostingMonthConflicts(
  transaction: NormalizedTransaction,
  transactions: NormalizedTransaction[],
): NormalizedTransaction[] {
  return transactions.filter((existing) => {
    if (existing.month !== transaction.month) return false;
    if (existing.day === transaction.day) {
      return (
        existing.amount !== transaction.amount ||
        existing.normalizedDescription !== transaction.normalizedDescription
      );
    }
    const existingPosition = boundaryPosition(existing);
    const transactionPosition = boundaryPosition(transaction);
    return !(
      existingPosition &&
      transactionPosition &&
      existingPosition.occurrenceMonth !== transactionPosition.occurrenceMonth
    );
  });
}

function conflictsWithPostingMonthSchedule(
  transaction: NormalizedTransaction,
  transactions: NormalizedTransaction[],
): boolean {
  return getPostingMonthConflicts(transaction, transactions).length > 0;
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
  continuityDistance: number;
  dateDistance: number;
  descriptionDistance: number;
  replacedTransactions: NormalizedTransaction[];
}

function getContinuityDistance(
  transaction: NormalizedTransaction,
  representative: NormalizedTransaction,
  boundaryPattern: boolean,
): number | null {
  const representativePosition = boundaryPosition(representative);
  const transactionPosition = boundaryPosition(transaction);
  const crossesDelayedBoundary =
    representativePosition?.side === "end" && transactionPosition?.side === "start";
  const representativeOccurrenceMonth = crossesDelayedBoundary
    ? representativePosition.occurrenceMonth
    : getOccurrenceMonth(representative, boundaryPattern);
  const transactionOccurrenceMonth = crossesDelayedBoundary
    ? transactionPosition.occurrenceMonth
    : getOccurrenceMonth(transaction, boundaryPattern);
  if (representativeOccurrenceMonth === transactionOccurrenceMonth) return 1;
  return shiftYearMonthKey(representativeOccurrenceMonth, 1) === transactionOccurrenceMonth
    ? 0
    : null;
}

function getGroupMatchScore(
  transaction: NormalizedTransaction,
  group: TransactionGroup,
  options: Required<GenerateRecurringCandidatesOptions>,
): GroupMatchScore | null {
  const boundaryPattern = isMonthBoundaryPattern(group.transactions);
  const monthlyTransactions = deduplicateOccurrences(group.transactions, boundaryPattern);
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
  const continuityDistance = getContinuityDistance(transaction, representative, boundaryPattern);
  if (continuityDistance === null) return null;
  if (conflictsWithBoundaryOccurrence(transaction, group.transactions)) return null;
  const postingMonthConflicts = getPostingMonthConflicts(transaction, group.transactions);
  if (postingMonthConflicts.length > 0) {
    if (
      postingMonthConflicts.some(
        (existing) =>
          existing.day === transaction.day &&
          existing.normalizedDescription !== transaction.normalizedDescription,
      )
    ) {
      return null;
    }
    const conflictSet = new Set(postingMonthConflicts);
    const historyGroup = {
      transactions: group.transactions.filter((existing) => !conflictSet.has(existing)),
    };
    const candidateScore = getGroupMatchScore(transaction, historyGroup, options);
    const bestExistingScore = postingMonthConflicts
      .map((existing) => getGroupMatchScore(existing, historyGroup, options))
      .filter((score): score is GroupMatchScore => score !== null)
      .sort(compareGroupMatchScores)[0];
    if (
      !candidateScore ||
      !bestExistingScore ||
      compareGroupMatchScores(candidateScore, bestExistingScore) >= 0
    ) {
      return null;
    }
    return { ...candidateScore, replacedTransactions: postingMonthConflicts };
  }

  const dayDistances = monthlyTransactions.map((existing) =>
    calendarDayDistance(transaction, existing),
  );
  const allWithinBoundaryWindow = [transaction, ...monthlyTransactions].every(
    (item) => boundaryPosition(item) !== null,
  );
  const fixedCalendarDay = inferFixedCalendarDay(monthlyTransactions);
  let groupDayDistance = median(dayDistances);
  if (fixedCalendarDay) {
    const { year, month } = parseIsoDateKey(transaction.date);
    const expectedDay = Math.min(fixedCalendarDay, getDaysInMonth(year, month));
    groupDayDistance = Math.abs(transaction.day - expectedDay);
  } else if (allWithinBoundaryWindow) {
    groupDayDistance = Math.min(...dayDistances);
  }
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
    continuityDistance,
    dateDistance: groupDayDistance,
    descriptionDistance: 1 - descriptionSimilarity,
    replacedTransactions: [],
  };
}

function compareGroupMatchScores(left: GroupMatchScore, right: GroupMatchScore): number {
  return (
    left.dateDistance - right.dateDistance ||
    left.amountDistance - right.amountDistance ||
    left.continuityDistance - right.continuityDistance ||
    left.descriptionDistance - right.descriptionDistance
  );
}

function isPerfectGroupMatchScore(score: GroupMatchScore): boolean {
  return (
    score.dateDistance === 0 &&
    score.amountDistance === 0 &&
    score.continuityDistance === 0 &&
    score.descriptionDistance === 0
  );
}

function getIndexedGroupCandidate(
  transaction: NormalizedTransaction,
  group: TransactionGroup,
  options: Required<GenerateRecurringCandidatesOptions>,
  allowPostingMonthConflict: boolean,
): { conflict?: NormalizedTransaction; group: TransactionGroup; score: GroupMatchScore } | null {
  if (!allowPostingMonthConflict) {
    const score = getGroupMatchScore(transaction, group, options);
    return score ? { group, score } : null;
  }

  const conflicts = getPostingMonthConflicts(transaction, group.transactions);
  if (conflicts.length > 1) return null;
  const conflict = conflicts[0];
  const historyGroup = conflict
    ? { transactions: group.transactions.filter((existing) => existing !== conflict) }
    : group;
  const score = getGroupMatchScore(transaction, historyGroup, options);
  return score ? { conflict, group, score } : null;
}

function getOptimizedGroups(
  partition: GroupPartition,
  transaction: NormalizedTransaction,
  options: Required<GenerateRecurringCandidatesOptions>,
  forAugmentingMatch = false,
): TransactionGroup[] {
  const exactRecurringGroup = partition.exactRecurringSlots.get(exactRecurringSlotKey(transaction));
  const exactRecurringScore = exactRecurringGroup
    ? getGroupMatchScore(transaction, exactRecurringGroup, options)
    : null;
  if (
    !forAugmentingMatch &&
    exactRecurringGroup &&
    exactRecurringScore &&
    isPerfectGroupMatchScore(exactRecurringScore)
  ) {
    return [exactRecurringGroup];
  }
  const groups = new Set<TransactionGroup>();
  if (exactRecurringScore && exactRecurringGroup) groups.add(exactRecurringGroup);
  for (const group of getAmountIndexedGroups(
    partition.amountGroupsByDescriptionAndDay.get(transaction.normalizedDescription),
    partition.amountKeysByDescriptionAndDay.get(transaction.normalizedDescription),
    partition,
    transaction,
    options,
    MAX_GROUPS_PER_AMOUNT_BUCKET,
    true,
    forAugmentingMatch,
  )) {
    groups.add(group);
  }
  for (const group of getAmountIndexedGroups(
    partition.amountGroupsByDay,
    partition.amountKeysByDay,
    partition,
    transaction,
    options,
    MAX_GROUPS_PER_AMOUNT_BUCKET,
    options.descriptionSimilarityThreshold === 0,
    forAugmentingMatch,
  )) {
    groups.add(group);
  }
  return [...groups];
}

function getFuzzyIndexedGroups(
  partition: GroupPartition,
  transaction: NormalizedTransaction,
  options: Required<GenerateRecurringCandidatesOptions>,
): TransactionGroup[] {
  const similarityThreshold = options.descriptionSimilarityThreshold;
  if (similarityThreshold === 0) return [];

  const transactionBigrams = getBigrams(transaction.normalizedDescription);
  const previousMonth = shiftYearMonthKey(transaction.month, -1);
  const candidateCounts = new Map(
    [...transactionBigrams].map((bigram) => [
      bigram,
      partition.groupsByBigramAndMonth.get(bigram)?.get(previousMonth)?.size ?? 0,
    ]),
  );
  const indexedBigrams = [...transactionBigrams].sort(
    (left, right) => (candidateCounts.get(left) ?? 0) - (candidateCounts.get(right) ?? 0),
  );
  const candidateSimilarities = new Map<TransactionGroup, number>();
  candidateSearch: for (const bigram of indexedBigrams) {
    const groupsByDescription = partition.groupsByBigramAndMonth.get(bigram)?.get(previousMonth);
    for (const [description, groups] of groupsByDescription ?? []) {
      if (description === transaction.normalizedDescription) continue;
      for (const group of groups) {
        if (candidateSimilarities.has(group)) continue;
        const anchorBigrams = partition.anchorBigrams.get(group);
        if (!anchorBigrams) continue;
        const similarity = calculateBigramSimilarity(transactionBigrams, anchorBigrams);
        if (similarity < similarityThreshold) continue;
        candidateSimilarities.set(group, similarity);
        if (candidateSimilarities.size >= MAX_FUZZY_PRE_SCORE_GROUPS) break candidateSearch;
      }
    }
    if (candidateSimilarities.size >= MAX_FUZZY_CANDIDATE_GROUPS) break;
  }
  const scoredCandidates = [...candidateSimilarities].map(([group, similarity]) => ({
    group,
    score: getGroupMatchScore(transaction, group, options),
    similarity,
  }));
  return scoredCandidates
    .sort((left, right) => {
      if (left.score && right.score) {
        return (
          compareGroupMatchScores(left.score, right.score) ||
          right.similarity - left.similarity ||
          right.group.transactions.length - left.group.transactions.length
        );
      }
      if (left.score) return -1;
      if (right.score) return 1;
      return right.similarity - left.similarity;
    })
    .slice(0, MAX_FUZZY_CANDIDATE_GROUPS)
    .map(({ group }) => group);
}

function findBestGroupMatch(
  transaction: NormalizedTransaction,
  groups: TransactionGroup[],
  options: Required<GenerateRecurringCandidatesOptions>,
): { group: TransactionGroup; score: GroupMatchScore } | undefined {
  let bestMatch: { group: TransactionGroup; score: GroupMatchScore } | undefined;
  for (const group of groups) {
    const score = getGroupMatchScore(transaction, group, options);
    if (score && (!bestMatch || compareGroupMatchScores(score, bestMatch.score) < 0)) {
      bestMatch = { group, score };
    }
  }
  return bestMatch;
}

interface AugmentingAssignment {
  transaction: NormalizedTransaction;
  group: TransactionGroup;
  score: GroupMatchScore;
}

function findAugmentingPath(
  transaction: NormalizedTransaction,
  candidateGroups: TransactionGroup[],
  partition: GroupPartition,
  options: Required<GenerateRecurringCandidatesOptions>,
  visitedGroups = new Set<TransactionGroup>(),
): AugmentingAssignment[] | undefined {
  const candidates = candidateGroups
    .filter((group) => !visitedGroups.has(group))
    .map((group) => getIndexedGroupCandidate(transaction, group, options, true))
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => compareGroupMatchScores(left.score, right.score));

  for (const { conflict, group, score } of candidates) {
    if (visitedGroups.has(group)) continue;
    visitedGroups.add(group);
    if (!conflict) return [{ transaction, group, score }];

    const alternativeGroups = [
      ...new Set([
        ...getOptimizedGroups(partition, conflict, options, true),
        ...getFuzzyIndexedGroups(partition, conflict, options),
      ]),
    ].filter((candidate) => candidate !== group);
    const displacedPath = findAugmentingPath(
      conflict,
      alternativeGroups,
      partition,
      options,
      visitedGroups,
    );
    if (displacedPath) return [...displacedPath, { transaction, group, score }];
  }
  return undefined;
}

function lowerBound(values: number[], target: number): number {
  let start = 0;
  let end = values.length;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (values[middle] < target) start = middle + 1;
    else end = middle;
  }
  return start;
}

function getAmountIndexedGroups(
  groupsByDay: AmountGroupsByDay | undefined,
  amountKeysByDay: AmountKeysByDay | undefined,
  partition: GroupPartition,
  transaction: NormalizedTransaction,
  options: Required<GenerateRecurringCandidatesOptions>,
  maxCandidateGroups: number,
  rankBeforeCapping: boolean,
  includePostingMonthConflicts = false,
): TransactionGroup[] {
  if (!groupsByDay || !amountKeysByDay) return [];

  const candidates = new Set<TransactionGroup>();
  const previousMonth = shiftYearMonthKey(transaction.month, -1);
  for (const [day, groupsByAmount] of groupsByDay) {
    let dayCandidateCount = 0;
    let ineligibleCurrentMonthCount = 0;
    let reachedIneligibleLimit = false;
    const rankedGroups = [];
    const addCandidate = (group: TransactionGroup): boolean => {
      const previousSize = candidates.size;
      candidates.add(group);
      if (candidates.size > previousSize) dayCandidateCount++;
      return dayCandidateCount >= maxCandidateGroups;
    };
    const amountKeys = amountKeysByDay.get(day) ?? [];
    const insertionIndex = lowerBound(amountKeys, transaction.amount);
    let leftIndex = insertionIndex - 1;
    let rightIndex = insertionIndex;
    while (leftIndex >= 0 || rightIndex < amountKeys.length) {
      const leftRatio =
        leftIndex >= 0
          ? Math.abs(amountKeys[leftIndex] - transaction.amount) /
            Math.max(amountKeys[leftIndex], transaction.amount)
          : Number.POSITIVE_INFINITY;
      const rightRatio =
        rightIndex < amountKeys.length
          ? Math.abs(amountKeys[rightIndex] - transaction.amount) /
            Math.max(amountKeys[rightIndex], transaction.amount)
          : Number.POSITIVE_INFINITY;
      const index = leftRatio <= rightRatio ? leftIndex-- : rightIndex++;
      const amount = amountKeys[index];
      if (Math.min(leftRatio, rightRatio) > options.amountToleranceRatio) break;
      for (const group of groupsByAmount.get(amount) ?? []) {
        const latestMonth = partition.latestMonths.get(group);
        if (latestMonth !== transaction.month && latestMonth !== previousMonth) {
          const boundaryPattern = isMonthBoundaryPattern(group.transactions);
          const representative = deduplicateOccurrences(group.transactions, boundaryPattern).at(-1);
          if (
            !representative ||
            getContinuityDistance(transaction, representative, boundaryPattern) === null
          ) {
            continue;
          }
        }
        if (
          latestMonth === transaction.month &&
          !includePostingMonthConflicts &&
          conflictsWithPostingMonthSchedule(transaction, group.transactions)
        ) {
          ineligibleCurrentMonthCount++;
          if (ineligibleCurrentMonthCount >= MAX_INELIGIBLE_CURRENT_MONTH_GROUPS) {
            reachedIneligibleLimit = true;
            break;
          }
          continue;
        }
        const candidate = getIndexedGroupCandidate(
          transaction,
          group,
          options,
          includePostingMonthConflicts,
        );
        if (!candidate) continue;
        if (rankBeforeCapping) {
          rankedGroups.push(candidate);
          continue;
        }
        if (addCandidate(group)) break;
      }
      if (reachedIneligibleLimit) break;
      if (dayCandidateCount >= maxCandidateGroups) break;
    }
    if (rankBeforeCapping) {
      rankedGroups.sort((left, right) => compareGroupMatchScores(left.score, right.score));
      for (const { group } of rankedGroups) {
        if (addCandidate(group)) break;
      }
    }
  }
  return [...candidates];
}

function exactOccurrenceKey(transaction: NormalizedTransaction): string {
  return [transaction.date, transaction.amount, transaction.normalizedDescription].join("\0");
}

function exactRecurringSlotKey(transaction: NormalizedTransaction): string {
  return [transaction.day, transaction.amount, transaction.normalizedDescription].join("\0");
}

function indexGroupMonth(partition: GroupPartition, group: TransactionGroup, month: string): void {
  const description = group.transactions[0]?.normalizedDescription ?? "";
  for (const bigram of partition.anchorBigrams.get(group) ?? []) {
    const groupsByMonth = partition.groupsByBigramAndMonth.get(bigram) ?? new Map();
    const groupsByDescription = groupsByMonth.get(month) ?? new Map();
    const groups = groupsByDescription.get(description) ?? new Set();
    groups.add(group);
    groupsByDescription.set(description, groups);
    groupsByMonth.set(month, groupsByDescription);
    partition.groupsByBigramAndMonth.set(bigram, groupsByMonth);
  }
  partition.latestMonths.set(group, month);
}

function getIndexedAmounts(monthlyTransactions: NormalizedTransaction[]): number[] {
  const amounts = new Set([median(monthlyTransactions.map(({ amount }) => amount))]);
  const latestPostingMonth = monthlyTransactions.at(-1)?.month;
  const historicalTransactions = monthlyTransactions.filter(
    ({ month }) => month !== latestPostingMonth,
  );
  if (historicalTransactions.length > 0) {
    amounts.add(median(historicalTransactions.map(({ amount }) => amount)));
  }
  return [...amounts];
}

function indexGroupAmount(partition: GroupPartition, group: TransactionGroup): void {
  removeGroupAmountEntries(
    partition.amountGroupsByDay,
    partition.amountKeysByDay,
    group,
    partition.amountIndexEntries.get(group) ?? [],
  );
  reindexDescriptionAmount(partition, group);

  const boundaryPattern = isMonthBoundaryPattern(group.transactions);
  const monthlyTransactions = deduplicateOccurrences(group.transactions, boundaryPattern);
  if (monthlyTransactions.length === 0) return;
  const amounts = getIndexedAmounts(monthlyTransactions);
  const entries = [...new Set(monthlyTransactions.map((transaction) => transaction.day))].flatMap(
    (day) => amounts.map((amount) => ({ amount, day })),
  );
  for (const entry of entries) {
    indexGroupByDayAndAmount(
      partition.amountGroupsByDay,
      partition.amountKeysByDay,
      group,
      entry.day,
      entry.amount,
    );
  }
  partition.amountIndexEntries.set(group, entries);
}

function removeGroupAmountEntries(
  groupsByDay: AmountGroupsByDay,
  amountKeysByDay: AmountKeysByDay,
  group: TransactionGroup,
  entries: Array<{ amount: number; day: number }>,
): void {
  for (const { amount, day } of entries) {
    const groupsByAmount = groupsByDay.get(day);
    const groups = groupsByAmount?.get(amount);
    groups?.delete(group);
    if (groups?.size !== 0) continue;

    groupsByAmount?.delete(amount);
    const amountKeys = amountKeysByDay.get(day);
    if (!amountKeys) continue;
    const index = lowerBound(amountKeys, amount);
    if (amountKeys[index] === amount) amountKeys.splice(index, 1);
  }
}

function indexGroupByDayAndAmount(
  groupsByDay: AmountGroupsByDay,
  amountKeysByDay: AmountKeysByDay,
  group: TransactionGroup,
  day: number,
  amount: number,
): void {
  const groupsByAmount = groupsByDay.get(day) ?? new Map();
  const groups = groupsByAmount.get(amount) ?? new Set();
  groups.add(group);
  groupsByAmount.set(amount, groups);
  groupsByDay.set(day, groupsByAmount);

  const amountKeys = amountKeysByDay.get(day) ?? [];
  const insertionIndex = lowerBound(amountKeys, amount);
  if (amountKeys[insertionIndex] !== amount) amountKeys.splice(insertionIndex, 0, amount);
  amountKeysByDay.set(day, amountKeys);
}

function reindexDescriptionAmount(partition: GroupPartition, group: TransactionGroup): void {
  const previousEntries = partition.descriptionAmountIndexEntries.get(group) ?? [];
  const previousDescriptions = new Set(previousEntries.map(({ description }) => description));
  for (const description of previousDescriptions) {
    const groupsByDay = partition.amountGroupsByDescriptionAndDay.get(description);
    const amountKeysByDay = partition.amountKeysByDescriptionAndDay.get(description);
    removeGroupAmountEntries(
      groupsByDay ?? new Map(),
      amountKeysByDay ?? new Map(),
      group,
      previousEntries.filter((entry) => entry.description === description),
    );
  }

  const boundaryPattern = isMonthBoundaryPattern(group.transactions);
  const monthlyTransactions = deduplicateOccurrences(group.transactions, boundaryPattern);
  if (monthlyTransactions.length === 0) return;
  const amounts = getIndexedAmounts(monthlyTransactions);
  const days = new Set(monthlyTransactions.map((transaction) => transaction.day));
  const descriptions = new Set(
    monthlyTransactions.map((transaction) => transaction.normalizedDescription),
  );
  const entries = [...descriptions].flatMap((description) => {
    const groupsByDay = partition.amountGroupsByDescriptionAndDay.get(description) ?? new Map();
    const amountKeysByDay = partition.amountKeysByDescriptionAndDay.get(description) ?? new Map();
    const descriptionEntries = [...days].flatMap((day) =>
      amounts.map((amount) => ({ amount, day, description })),
    );
    for (const { amount, day } of descriptionEntries) {
      indexGroupByDayAndAmount(groupsByDay, amountKeysByDay, group, day, amount);
    }
    partition.amountGroupsByDescriptionAndDay.set(description, groupsByDay);
    partition.amountKeysByDescriptionAndDay.set(description, amountKeysByDay);
    return descriptionEntries;
  });
  partition.descriptionAmountIndexEntries.set(group, entries);
}

function moveGroupToMonth(partition: GroupPartition, group: TransactionGroup, month: string): void {
  const previousMonth = partition.latestMonths.get(group);
  if (!previousMonth || previousMonth === month) return;
  const description = group.transactions[0]?.normalizedDescription ?? "";
  for (const bigram of partition.anchorBigrams.get(group) ?? []) {
    partition.groupsByBigramAndMonth
      .get(bigram)
      ?.get(previousMonth)
      ?.get(description)
      ?.delete(group);
  }
  indexGroupMonth(partition, group, month);
}

function groupTransactions(
  transactions: NormalizedTransaction[],
  options: Required<GenerateRecurringCandidatesOptions>,
): TransactionGroup[] {
  const partitions = new Map<string, GroupPartition>();
  const isolatedGroups = new Map<string, TransactionGroup>();
  const pendingTransactions = [...transactions];
  for (let cursor = 0; cursor < pendingTransactions.length; cursor++) {
    const transaction = pendingTransactions[cursor];
    if (!transaction.normalizedDescription) {
      const isolatedKey = [
        accountIdKey(transaction.accountId),
        transaction.type,
        transaction.classification,
        transaction.date,
        transaction.amount,
        normalizeCaseAndWidth(transaction.description),
        normalizeCaseAndWidth(transaction.category),
        normalizeCaseAndWidth(transaction.subCategory),
      ].join("\0");
      const group = isolatedGroups.get(isolatedKey);
      if (group) group.transactions.push(transaction);
      else isolatedGroups.set(isolatedKey, { transactions: [transaction] });
      continue;
    }
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
      amountIndexEntries: new Map(),
      amountGroupsByDay: new Map(),
      amountGroupsByDescriptionAndDay: new Map(),
      amountKeysByDay: new Map(),
      amountKeysByDescriptionAndDay: new Map(),
      anchorBigrams: new Map(),
      descriptionAmountIndexEntries: new Map(),
      exactOccurrences: new Map(),
      exactRecurringSlots: new Map(),
      groups: [],
      groupsByBigramAndMonth: new Map(),
      latestMonths: new Map(),
    };
    if (partition.exactOccurrences.has(exactOccurrenceKey(transaction))) continue;
    const transactionBigrams = getBigrams(transaction.normalizedDescription);
    const optimizedGroups = getOptimizedGroups(partition, transaction, options);
    const optimizedMatch = findBestGroupMatch(transaction, optimizedGroups, options);
    const optimizedIsPerfect = optimizedMatch && isPerfectGroupMatchScore(optimizedMatch.score);
    const fuzzyGroups = optimizedIsPerfect
      ? []
      : getFuzzyIndexedGroups(partition, transaction, options);
    const fuzzyMatch = findBestGroupMatch(transaction, fuzzyGroups, options);
    let selectedMatch =
      fuzzyMatch &&
      (!optimizedMatch || compareGroupMatchScores(fuzzyMatch.score, optimizedMatch.score) < 0)
        ? fuzzyMatch
        : optimizedMatch;
    if (!selectedMatch) {
      const augmentingPath = findAugmentingPath(
        transaction,
        [
          ...new Set([
            ...getOptimizedGroups(partition, transaction, options, true),
            ...fuzzyGroups,
          ]),
        ],
        partition,
        options,
      );
      if (augmentingPath) {
        for (const assignment of augmentingPath.slice(0, -1)) {
          const sourceGroup = partition.exactOccurrences.get(
            exactOccurrenceKey(assignment.transaction),
          );
          if (sourceGroup && sourceGroup !== assignment.group) {
            sourceGroup.transactions = sourceGroup.transactions.filter(
              (existing) => existing !== assignment.transaction,
            );
            indexGroupAmount(partition, sourceGroup);
          }
          moveGroupToMonth(partition, assignment.group, assignment.transaction.month);
          assignment.group.transactions.push(assignment.transaction);
          indexGroupAmount(partition, assignment.group);
          partition.exactOccurrences.set(
            exactOccurrenceKey(assignment.transaction),
            assignment.group,
          );
          partition.exactRecurringSlots.set(
            exactRecurringSlotKey(assignment.transaction),
            assignment.group,
          );
        }
        const currentAssignment = augmentingPath.at(-1);
        if (currentAssignment) {
          selectedMatch = { group: currentAssignment.group, score: currentAssignment.score };
        }
      }
    }
    if (selectedMatch) {
      const existingGroup = selectedMatch.group;
      moveGroupToMonth(partition, existingGroup, transaction.month);
      const replacements = new Set(selectedMatch.score.replacedTransactions);
      existingGroup.transactions = existingGroup.transactions.filter(
        (existing) => !replacements.has(existing),
      );
      for (const replacement of replacements) {
        if (partition.exactOccurrences.get(exactOccurrenceKey(replacement)) === existingGroup) {
          partition.exactOccurrences.delete(exactOccurrenceKey(replacement));
        }
        if (
          partition.exactRecurringSlots.get(exactRecurringSlotKey(replacement)) === existingGroup
        ) {
          partition.exactRecurringSlots.delete(exactRecurringSlotKey(replacement));
        }
        pendingTransactions.splice(cursor + 1, 0, replacement);
      }
      existingGroup.transactions.push(transaction);
      indexGroupAmount(partition, existingGroup);
      partition.exactOccurrences.set(exactOccurrenceKey(transaction), existingGroup);
      partition.exactRecurringSlots.set(exactRecurringSlotKey(transaction), existingGroup);
    } else {
      const group = { transactions: [transaction] };
      partition.groups.push(group);
      partition.anchorBigrams.set(group, transactionBigrams);
      partition.exactOccurrences.set(exactOccurrenceKey(transaction), group);
      partition.exactRecurringSlots.set(exactRecurringSlotKey(transaction), group);
      indexGroupAmount(partition, group);
      indexGroupMonth(partition, group, transaction.month);
    }
    partitions.set(partitionKey, partition);
  }
  return [...partitions.values()]
    .flatMap(({ groups }) => groups)
    .concat([...isolatedGroups.values()]);
}

function isMonthBoundaryPattern(occurrences: NormalizedTransaction[]): boolean {
  const hasMonthStartOccurrence = occurrences.some(
    (occurrence) => occurrence.day <= MONTH_BOUNDARY_WINDOW_DAYS,
  );
  const hasMonthEndOccurrence = occurrences.some(
    (occurrence) => daysFromMonthEnd(occurrence) <= MONTH_BOUNDARY_WINDOW_DAYS,
  );
  const allMonthEndSide = occurrences.every(
    (occurrence) => daysFromMonthEnd(occurrence) <= MONTH_BOUNDARY_WINDOW_DAYS,
  );
  return (
    allMonthEndSide ||
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

function getActiveBoundarySuffix(transactions: NormalizedTransaction[]): NormalizedTransaction[] {
  let occurrences = getMonthlySuffix(deduplicateOccurrences(transactions, true), true);
  while (occurrences.length > 1 && !isMonthBoundaryPattern(occurrences)) {
    occurrences = occurrences.slice(1);
  }
  return occurrences;
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
  const latestScheduledMonth = boundaryPattern ? latestOccurrenceMonth : latest.month;
  if (latestScheduledMonth !== previousMonth) return null;
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
    const result = compareCodePointStrings(left, right);
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

function predictDay(
  occurrences: NormalizedTransaction[],
  targetMonthDays: number,
  boundaryPattern: boolean,
): number {
  const days = occurrences.map(({ day }) => day);
  if (days.every((day) => day === days[0])) return Math.min(days[0], targetMonthDays);
  const fixedCalendarDay = inferFixedCalendarDay(occurrences);
  if (fixedCalendarDay) return Math.min(fixedCalendarDay, targetMonthDays);
  const allMonthEndSide = occurrences.every(
    (occurrence) => daysFromMonthEnd(occurrence) <= MONTH_BOUNDARY_WINDOW_DAYS,
  );
  if (allMonthEndSide) {
    return targetMonthDays - Math.round(median(occurrences.map(daysFromMonthEnd)));
  }
  if (boundaryPattern) return targetMonthDays;
  return Math.min(Math.round(median(days)), targetMonthDays);
}

function createCandidate(
  group: TransactionGroup,
  targetMonth: string,
  options: Required<GenerateRecurringCandidatesOptions>,
): RecurringCandidate | null {
  const postingMonthOccurrences = getMonthlySuffix(
    deduplicateOccurrences(group.transactions, false),
    false,
  );
  const boundaryOccurrences = getActiveBoundarySuffix(group.transactions);
  const useBoundaryOccurrences =
    boundaryOccurrences.length >= 2 &&
    boundaryOccurrences.length > postingMonthOccurrences.length &&
    isMonthBoundaryPattern(boundaryOccurrences);
  const occurrences = useBoundaryOccurrences ? boundaryOccurrences : postingMonthOccurrences;
  const boundaryPattern = useBoundaryOccurrences || isMonthBoundaryPattern(occurrences);
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
  const predictedDay = predictDay(occurrences, targetMonthDays, boundaryPattern);
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
      const description = transaction.description?.trim() || null;
      const canonicalTransaction = { ...transaction, description };
      return {
        ...canonicalTransaction,
        amount: Math.abs(transaction.amount),
        classification: classifyRecurringTransaction(canonicalTransaction),
        day,
        month: transaction.date.slice(0, 7),
        normalizedDescription: normalizeGroupingText(canonicalTransaction),
      };
    })
    .filter(({ month }) => month >= firstHistoryMonth && month < targetMonth)
    .sort(compareTransactions);

  return groupTransactions(history, options)
    .map((group) => createCandidate(group, targetMonth, options))
    .filter((candidate): candidate is RecurringCandidate => candidate !== null)
    .sort(compareCandidates);
}
