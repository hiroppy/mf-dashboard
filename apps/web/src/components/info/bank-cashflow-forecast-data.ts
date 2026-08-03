import {
  calculateMonthlyBankBalanceForecasts,
  recurringCandidateToBankCashFlowEvent,
  type BankBalanceForecast,
  type BankCashFlowEventInput,
} from "@mf-dashboard/analytics/bank-balance-forecast";
import {
  classifyRecurringTransaction,
  generateRecurringCandidates,
  type RecurringCandidate,
  type RecurringTransaction,
} from "@mf-dashboard/analytics/recurring-candidates";
import { addDaysToIsoDateKey, parseIsoDateKey } from "@mf-dashboard/date-utils";

interface ForecastAccount {
  id: number;
  name: string;
  categoryName: string;
  totalAssets: number;
  lastUpdated: string | null;
}

interface ForecastTransaction {
  id: number;
  accountId: number | null;
  date: string;
  amount: number;
  type: string;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  isTransfer: boolean;
  isExcludedFromCalculation: boolean;
}

export interface BankCashFlowForecastView extends BankBalanceForecast {
  accountName: string;
}

const CANDIDATE_DATE_DRIFT_DAYS = 3;
const CANDIDATE_AMOUNT_TOLERANCE_RATIO = 0.1;

function isRecurringTransactionType(type: string): type is RecurringTransaction["type"] {
  return type === "income" || type === "expense" || type === "transfer";
}

function toRecurringTransactions(transactions: ForecastTransaction[]): RecurringTransaction[] {
  return transactions.flatMap((transaction) => {
    if (transaction.accountId === null || !isRecurringTransactionType(transaction.type)) return [];

    return [{ ...transaction, accountId: transaction.accountId, type: transaction.type }];
  });
}

function toActualEvent(transaction: ForecastTransaction): BankCashFlowEventInput | null {
  if (transaction.accountId === null || !isRecurringTransactionType(transaction.type)) return null;

  return {
    id: `actual-${transaction.id}`,
    accountId: transaction.accountId,
    date: transaction.date,
    amount: Math.abs(transaction.amount),
    direction: transaction.type === "income" ? "income" : "expense",
    status: "actual",
    description: transaction.description,
    classification: classifyRecurringTransaction(transaction),
    isTransfer: transaction.isTransfer || transaction.type === "transfer",
    isExcludedFromCalculation: transaction.isExcludedFromCalculation,
  };
}

function normalizeDescription(description: string | null | undefined): string {
  return description?.normalize("NFKC").trim().toLocaleLowerCase("ja-JP") ?? "";
}

function getBalanceAsOfDate(lastUpdated: string | null, currentDate: string): string | null {
  const date = lastUpdated?.slice(0, 10);
  if (!date || date < `${currentDate.slice(0, 7)}-01` || date > currentDate) return null;

  try {
    parseIsoDateKey(date);
    return date;
  } catch {
    return null;
  }
}

function matchesRecordedCandidate(
  candidate: RecurringCandidate,
  transaction: ForecastTransaction,
): boolean {
  const amountDifference = Math.abs(Math.abs(transaction.amount) - candidate.predictedAmount);
  const amountTolerance = Math.max(
    1,
    Math.round(candidate.predictedAmount * CANDIDATE_AMOUNT_TOLERANCE_RATIO),
  );
  const earliestDate = addDaysToIsoDateKey(candidate.predictedDate, -CANDIDATE_DATE_DRIFT_DAYS);
  const latestDate = addDaysToIsoDateKey(candidate.predictedDate, CANDIDATE_DATE_DRIFT_DAYS);

  return (
    transaction.accountId === candidate.accountId &&
    transaction.type === candidate.type &&
    normalizeDescription(transaction.description) === normalizeDescription(candidate.description) &&
    classifyRecurringTransaction(transaction) === candidate.classification &&
    amountDifference <= amountTolerance &&
    transaction.date >= earliestDate &&
    transaction.date <= latestDate
  );
}

function excludeRecordedCandidates(
  candidates: RecurringCandidate[],
  actualTransactions: ForecastTransaction[],
): RecurringCandidate[] {
  const matchedTransactionIndexes = new Set<number>();

  return candidates.filter((candidate) => {
    const matchIndex = actualTransactions.findIndex(
      (transaction, index) =>
        !matchedTransactionIndexes.has(index) && matchesRecordedCandidate(candidate, transaction),
    );
    if (matchIndex === -1) return true;

    matchedTransactionIndexes.add(matchIndex);
    return false;
  });
}

export function buildBankCashFlowForecastViews(
  accounts: ForecastAccount[],
  transactions: ForecastTransaction[],
  currentDate: string,
  candidates?: RecurringCandidate[],
): BankCashFlowForecastView[] {
  const bankAccounts = accounts.flatMap((account) => {
    if (account.categoryName !== "銀行") return [];

    const balanceAsOfDate = getBalanceAsOfDate(account.lastUpdated, currentDate);
    return balanceAsOfDate ? [{ ...account, balanceAsOfDate }] : [];
  });
  if (bankAccounts.length === 0) return [];

  const month = currentDate.slice(0, 7);
  const bankAccountIds = new Set(bankAccounts.map(({ id }) => id));
  const forecastCandidates =
    candidates ?? generateRecurringCandidates(toRecurringTransactions(transactions), month);
  const actualTransactions = transactions.filter(
    ({ accountId, date }) =>
      accountId !== null &&
      bankAccountIds.has(accountId) &&
      date.startsWith(month) &&
      date <= currentDate,
  );
  const actualEvents = actualTransactions.flatMap((transaction) => {
    const event = toActualEvent(transaction);
    return event ? [event] : [];
  });
  const eligibleCandidates = forecastCandidates.filter(
    (candidate) =>
      typeof candidate.accountId === "number" &&
      bankAccountIds.has(candidate.accountId) &&
      candidate.predictedDate >= currentDate,
  );
  const forecastEvents = excludeRecordedCandidates(eligibleCandidates, actualTransactions).map(
    (candidate, index) => recurringCandidateToBankCashFlowEvent(`forecast-${index}`, candidate),
  );

  const forecasts = calculateMonthlyBankBalanceForecasts(
    bankAccounts.map(({ id, totalAssets, balanceAsOfDate }) => ({
      accountId: id,
      currentBalance: totalAssets,
      balanceAsOfDate,
    })),
    [...actualEvents, ...forecastEvents],
    currentDate,
  );
  const accountNames = new Map(bankAccounts.map(({ id, name }) => [id, name]));

  return forecasts.map((forecast) => ({
    ...forecast,
    accountName: accountNames.get(Number(forecast.accountId)) ?? "銀行口座",
  }));
}
