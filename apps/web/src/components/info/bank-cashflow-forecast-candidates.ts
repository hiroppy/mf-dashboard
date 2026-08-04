import type { BankCashFlowDirection } from "@mf-dashboard/analytics/bank-balance-forecast";
import {
  classifyRecurringTransaction,
  generateRecurringCandidates,
  matchesRecurringCandidateIdentity,
  type RecurringCandidate,
} from "@mf-dashboard/analytics/recurring-candidates";
import {
  addDaysToIsoDateKey,
  addMonthsToIsoDateKey,
  formatIsoDateKey,
  getDaysInMonth,
  parseYearMonthKey,
  shiftYearMonthKey,
} from "@mf-dashboard/date-utils";

export interface ForecastAccount {
  id: number;
  name: string;
  categoryName: string;
  totalAssets: number;
  lastUpdated: string | null;
  scheduledWithdrawalAmount?: number | null;
  scheduledWithdrawalConfirmed?: boolean | null;
}

export interface ForecastTransaction {
  id: number | string;
  accountId: number | null;
  transferTargetAccountId: number | null;
  date: string;
  amount: number;
  type: string;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  isTransfer: boolean;
  isExcludedFromCalculation: boolean;
}

export type CandidateTransaction = Omit<ForecastTransaction, "accountId" | "type"> & {
  accountId: number;
  type: "income" | "expense";
};

export interface BankForecastDismissal {
  accountId: number;
  direction: BankCashFlowDirection;
  recurringIdentity: string;
  dismissedThroughDate: string;
}

const DATE_DRIFT_DAYS = 3;

function matchesRecordedCandidate(
  candidate: RecurringCandidate,
  transaction: ForecastTransaction,
): boolean {
  if (transaction.accountId === null) return false;

  const earliestDate = addDaysToIsoDateKey(candidate.predictedDate, -DATE_DRIFT_DAYS);
  const latestDate = addDaysToIsoDateKey(candidate.predictedDate, DATE_DRIFT_DAYS);

  return (
    transaction.accountId === candidate.accountId &&
    transaction.type === candidate.type &&
    matchesRecurringCandidateIdentity(candidate, transaction) &&
    classifyRecurringTransaction(transaction) === candidate.classification &&
    transaction.date >= earliestDate &&
    transaction.date <= latestDate
  );
}

export function excludeRecordedCandidates(
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

export function generateBankForecastCandidates(
  transactions: CandidateTransaction[],
  month: string,
): RecurringCandidate[] {
  const currentCandidates = generateRecurringCandidates(transactions, month);
  const previousMonth = shiftYearMonthKey(month, -1);
  const previousMonthTransactions = transactions.filter(({ date }) =>
    date.startsWith(previousMonth),
  );
  const staleCandidates = excludeRecordedCandidates(
    generateRecurringCandidates(transactions, previousMonth),
    previousMonthTransactions,
  )
    .filter(
      (staleCandidate) =>
        !currentCandidates.some(
          (currentCandidate) =>
            currentCandidate.accountId === staleCandidate.accountId &&
            currentCandidate.type === staleCandidate.type &&
            currentCandidate.classification === staleCandidate.classification &&
            currentCandidate.recurringIdentity === staleCandidate.recurringIdentity,
        ),
    )
    .map((candidate) => ({
      ...candidate,
      predictedDate: addMonthsToIsoDateKey(candidate.predictedDate, 1),
    }));

  return [...currentCandidates, ...staleCandidates];
}

function getCardWithdrawalAmount(
  account: ForecastAccount,
  cardLiabilities: Map<number, number>,
): { amount: number; source: "scheduled_withdrawal" | "liability" } | null {
  if (account.scheduledWithdrawalConfirmed) {
    return {
      amount: account.scheduledWithdrawalAmount ?? 0,
      source: "scheduled_withdrawal",
    };
  }

  const liabilityAmount = cardLiabilities.get(account.id);
  return liabilityAmount === undefined ? null : { amount: liabilityAmount, source: "liability" };
}

export function generateConfirmedWithdrawalCandidates(
  accounts: ForecastAccount[],
  transactions: ForecastTransaction[],
  bankAccountIds: Set<number>,
  month: string,
  cardLiabilities: Map<number, number>,
): RecurringCandidate[] {
  const targetMonth = parseYearMonthKey(month);
  const candidates: RecurringCandidate[] = [];

  for (const account of accounts) {
    if (account.categoryName !== "カード") continue;

    const withdrawal = getCardWithdrawalAmount(account, cardLiabilities);
    if (!withdrawal || withdrawal.amount <= 0) continue;

    const transfers = transactions
      .filter(
        (transaction) =>
          transaction.accountId === account.id &&
          transaction.transferTargetAccountId !== null &&
          bankAccountIds.has(transaction.transferTargetAccountId) &&
          (transaction.type === "transfer" || transaction.isTransfer),
      )
      .sort((left, right) => left.date.localeCompare(right.date));
    const latest = transfers.at(-1);
    if (!latest?.transferTargetAccountId) continue;
    if (transfers.some(({ date }) => date.startsWith(month))) continue;

    const transferHistory = transfers.map((transaction) => ({
      ...transaction,
      accountId: transaction.transferTargetAccountId!,
      type: "expense" as const,
      isTransfer: false,
      isExcludedFromCalculation: false,
    }));
    const generated = generateBankForecastCandidates(transferHistory, month).find(
      ({ accountId }) => accountId === latest.transferTargetAccountId,
    );
    const historyDates = transfers.map(({ date }) => date);
    const historyAmounts = transfers.map(({ amount }) => Math.abs(amount));

    candidates.push({
      accountId: latest.transferTargetAccountId,
      type: "expense",
      classification: "card",
      description: account.name,
      recurringIdentity: `confirmed-card-${account.id}`,
      predictedDate:
        generated?.predictedDate ??
        formatIsoDateKey({
          ...targetMonth,
          day: Math.min(
            Number(latest.date.slice(8, 10)),
            getDaysInMonth(targetMonth.year, targetMonth.month),
          ),
        }),
      predictedAmount: withdrawal.amount,
      amountSource: withdrawal.source,
      evidence: generated?.evidence ?? {
        occurrenceCount: transfers.length,
        dateRange: {
          from: historyDates[0] ?? latest.date,
          to: historyDates.at(-1) ?? latest.date,
        },
        amountRange: {
          min: Math.min(...historyAmounts),
          max: Math.max(...historyAmounts),
        },
      },
    });
  }

  return candidates;
}

export function getForecastEventId(candidate: RecurringCandidate): string {
  return [
    "forecast",
    candidate.accountId,
    candidate.type,
    candidate.recurringIdentity ?? candidate.description ?? "",
    candidate.predictedDate,
  ].join(":");
}
