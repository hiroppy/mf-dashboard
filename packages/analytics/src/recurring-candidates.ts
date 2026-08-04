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
  occurrenceCount: number;
  dateRange: { from: string; to: string };
  amountRange: { min: number; max: number };
}

export interface RecurringCandidate {
  accountId: string | number;
  type: "income" | "expense";
  classification: RecurringCandidateClassification;
  description: string | null;
  recurringIdentity?: string;
  predictedDate: string;
  predictedAmount: number;
  amountSource?: "scheduled_withdrawal" | "liability";
  evidence: RecurringCandidateEvidence;
}

interface GenerateRecurringCandidatesOptions {
  lookbackMonths?: number;
}

type IdentitySource = Pick<RecurringTransaction, "category" | "description" | "subCategory">;

interface NormalizedTransaction extends RecurringTransaction {
  amount: number;
  classification: RecurringCandidateClassification;
  day: number;
  identity: string;
  month: string;
}

const DEFAULT_LOOKBACK_MONTHS = 12;
const GENERIC_DESCRIPTIONS = new Set(["payment", "入出金", "振替", "振込", "口座振替", "自動振替"]);

const classificationRules: Array<{
  classification: RecurringCandidateClassification;
  terms: string[];
}> = [
  { classification: "executive_compensation", terms: ["役員報酬", "executive compensation"] },
  { classification: "salary", terms: ["給与", "給料", "賞与", "salary", "payroll"] },
  { classification: "rent", terms: ["家賃", "賃料", "rent"] },
  {
    classification: "loan",
    terms: ["ローン", "住宅金融", "融資返済", "loan", "mortgage"],
  },
  {
    classification: "tax",
    terms: ["税", "国民年金", "社会保険", "tax", "pension"],
  },
  {
    classification: "card",
    terms: ["カード", "クレジット", "card", "visa", "mastercard", "amex"],
  },
];

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").toLocaleLowerCase("ja-JP").trim();
}

function includesTerm(text: string, term: string): boolean {
  if (/^[a-z ]+$/u.test(term)) {
    return new RegExp(`(^|[^a-z])${term.replaceAll(" ", "\\s+")}($|[^a-z])`, "u").test(text);
  }
  return text.includes(term);
}

export function classifyRecurringTransaction(
  transaction: Pick<RecurringTransaction, "category" | "subCategory" | "description">,
): RecurringCandidateClassification {
  const text = normalizeText(
    [transaction.category, transaction.subCategory, transaction.description]
      .filter(Boolean)
      .join(" "),
  );
  return (
    classificationRules.find(({ terms }) => terms.some((term) => includesTerm(text, term)))
      ?.classification ?? "other"
  );
}

function normalizeDescription(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/(?:19|20)\d{2}[年/.-]\d{1,2}(?:[月/.-]\d{1,2}日?)?/gu, " ")
    .replace(/\d{1,2}月(?:\d{1,2}日|分)?/gu, " ")
    .replace(
      /\b(invoice|authorization|auth|reference|ref)\s*(?:no\.?|number)?\s*[:#-]?\s*\d+\b/gu,
      "$1",
    )
    .replace(/\b(?:19|20)\d{2}[-/]?\d{0,4}\b/gu, " ")
    .replace(/[\p{Punctuation}\p{Separator}\p{Symbol}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeCategory(value: string | null | undefined): string {
  return normalizeText(value).replace(/[\p{Punctuation}\p{Separator}\p{Symbol}]+/gu, "");
}

function getRecurringIdentity(transaction: IdentitySource): string {
  const description = normalizeDescription(transaction.description);
  const categoryParts = [transaction.category, transaction.subCategory].map(normalizeCategory);
  const category = categoryParts.some(Boolean) ? categoryParts.join("categorysep") : "";

  if (!description) return category;
  if (!GENERIC_DESCRIPTIONS.has(description)) return description;
  return category ? `${description}descriptionsep${category}` : "";
}

export function matchesRecurringCandidateIdentity(
  candidate: Pick<RecurringCandidate, "description" | "recurringIdentity">,
  transaction: IdentitySource,
): boolean {
  const candidateIdentity =
    candidate.recurringIdentity ?? normalizeDescription(candidate.description);
  const transactionIdentity = getRecurringIdentity(transaction);
  if (candidateIdentity === transactionIdentity) return true;

  const candidateDescription = normalizeDescription(candidate.description);
  return (
    candidateDescription !== "" &&
    candidateDescription === normalizeDescription(transaction.description)
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function getConsecutiveSuffix(transactions: NormalizedTransaction[]): NormalizedTransaction[] {
  const byMonth = new Map<string, NormalizedTransaction>();
  for (const transaction of transactions) byMonth.set(transaction.month, transaction);

  const occurrences = [...byMonth.values()].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  let start = occurrences.length - 1;
  while (
    start > 0 &&
    shiftYearMonthKey(occurrences[start - 1]!.month, 1) === occurrences[start]!.month
  ) {
    start--;
  }
  return occurrences.slice(start);
}

function hasStructuredIncomeClassification(transaction: NormalizedTransaction): boolean {
  if (transaction.type !== "income") return false;
  const structuredText = normalizeText([transaction.category, transaction.subCategory].join(" "));
  if (structuredText.includes("賞与")) return false;
  const classification = classifyRecurringTransaction({
    category: transaction.category,
    subCategory: transaction.subCategory,
  });
  return classification === "salary" || classification === "executive_compensation";
}

function createCandidate(
  transactions: NormalizedTransaction[],
  targetMonth: string,
): RecurringCandidate | null {
  const occurrences = getConsecutiveSuffix(transactions);
  const latest = occurrences.at(-1);
  if (!latest || latest.month !== shiftYearMonthKey(targetMonth, -1)) return null;

  if (occurrences.length < 2 && !hasStructuredIncomeClassification(latest)) {
    return null;
  }

  const { year, month } = parseYearMonthKey(targetMonth);
  const predictedDay = Math.min(
    Math.round(median(occurrences.map(({ day }) => day))),
    getDaysInMonth(year, month),
  );
  const dates = occurrences.map(({ date }) => date).sort();
  const amounts = occurrences.map(({ amount }) => amount);

  return {
    accountId: latest.accountId,
    type: latest.type as "income" | "expense",
    classification: latest.classification,
    description: latest.description?.trim() || null,
    recurringIdentity: latest.identity,
    predictedDate: formatIsoDateKey({ year, month, day: predictedDay }),
    predictedAmount: latest.amount,
    evidence: {
      occurrenceCount: occurrences.length,
      dateRange: { from: dates[0]!, to: dates.at(-1)! },
      amountRange: { min: Math.min(...amounts), max: Math.max(...amounts) },
    },
  };
}

function compareCandidates(left: RecurringCandidate, right: RecurringCandidate): number {
  return (
    left.predictedDate.localeCompare(right.predictedDate) ||
    String(left.accountId).localeCompare(String(right.accountId)) ||
    left.type.localeCompare(right.type) ||
    (left.recurringIdentity ?? "").localeCompare(right.recurringIdentity ?? "")
  );
}

export function generateRecurringCandidates(
  transactions: RecurringTransaction[],
  targetMonth: string,
  options: GenerateRecurringCandidatesOptions = {},
): RecurringCandidate[] {
  parseYearMonthKey(targetMonth);
  const lookbackMonths = options.lookbackMonths ?? DEFAULT_LOOKBACK_MONTHS;
  if (!Number.isInteger(lookbackMonths) || lookbackMonths < 1) {
    throw new Error("lookbackMonths must be a positive integer");
  }

  const firstHistoryMonth = shiftYearMonthKey(targetMonth, -lookbackMonths);
  const groups = new Map<string, NormalizedTransaction[]>();

  for (const transaction of transactions) {
    if (
      transaction.type === "transfer" ||
      transaction.isTransfer ||
      transaction.isExcludedFromCalculation ||
      !Number.isFinite(transaction.amount) ||
      transaction.amount === 0
    ) {
      continue;
    }

    const date = parseIsoDateKey(transaction.date);
    const month = transaction.date.slice(0, 7);
    if (month < firstHistoryMonth || month >= targetMonth) continue;

    const canonical = { ...transaction, description: transaction.description?.trim() || null };
    const identity = getRecurringIdentity(canonical);
    if (!identity) continue;

    const normalized: NormalizedTransaction = {
      ...canonical,
      amount: Math.abs(transaction.amount),
      classification: classifyRecurringTransaction(canonical),
      day: date.day,
      identity,
      month,
    };
    const key = `${typeof transaction.accountId}:${String(transaction.accountId)}|${transaction.type}|${identity}`;
    const group = groups.get(key) ?? [];
    group.push(normalized);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => createCandidate(group, targetMonth))
    .filter((candidate): candidate is RecurringCandidate => candidate !== null)
    .sort(compareCandidates);
}
