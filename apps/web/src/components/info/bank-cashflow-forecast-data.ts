import {
  calculateMonthlyBankBalanceForecasts,
  recurringCandidateToBankCashFlowEvent,
  type BankBalanceForecast,
  type BankCashFlowEventInput,
} from "@mf-dashboard/analytics/bank-balance-forecast";
import {
  classifyRecurringTransaction,
  matchesRecurringCandidateIdentity,
  type RecurringCandidate,
} from "@mf-dashboard/analytics/recurring-candidates";
import { parseIsoDateKey } from "@mf-dashboard/date-utils";
import {
  createNormalTransactionMirrorKeys,
  createTransferMovementKey,
  hasNormalTransactionMirror,
} from "@mf-dashboard/db";
import {
  excludeRecordedCandidates,
  generateBankForecastCandidates,
  generateConfirmedWithdrawalCandidates,
  getForecastEventId,
  type BankForecastDismissal,
  type ForecastAccount,
  type ForecastTransaction,
} from "./bank-cashflow-forecast-candidates";

interface ForecastCardLiability {
  accountId: number;
  amount: number;
}

type BankCashFlowTransaction = Omit<ForecastTransaction, "accountId" | "type"> & {
  accountId: number;
  type: "income" | "expense";
};

export interface BankCashFlowForecastView extends BankBalanceForecast {
  accountName: string;
}

const DEMO_FORECAST_AS_OF_DAY = "03";

export function getBankForecastCurrentDate(today: string, demoMode: boolean): string {
  return demoMode ? `${today.slice(0, 7)}-${DEMO_FORECAST_AS_OF_DAY}` : today;
}

function isBankCashFlowType(type: string): type is BankCashFlowTransaction["type"] {
  return type === "income" || type === "expense";
}

function toBankCashFlowTransactions(
  transactions: ForecastTransaction[],
  bankAccountIds: Set<number>,
): BankCashFlowTransaction[] {
  const cashFlows: BankCashFlowTransaction[] = [];
  const normalTransactionKeys = createNormalTransactionMirrorKeys(transactions);
  const seenTransferKeys = new Set<string>();

  for (const transaction of transactions) {
    if (
      transaction.accountId !== null &&
      transaction.accountId === transaction.transferTargetAccountId &&
      (transaction.type === "transfer" || transaction.isTransfer)
    ) {
      continue;
    }

    if (transaction.type !== "transfer" && !transaction.isTransfer) {
      if (
        transaction.accountId !== null &&
        bankAccountIds.has(transaction.accountId) &&
        isBankCashFlowType(transaction.type)
      ) {
        cashFlows.push({
          ...transaction,
          accountId: transaction.accountId,
          type: transaction.type,
        });
      }
      continue;
    }

    const transferKey = createTransferMovementKey(transaction);
    if (!transferKey) continue;
    if (seenTransferKeys.has(transferKey)) continue;
    seenTransferKeys.add(transferKey);

    if (transaction.accountId !== null && bankAccountIds.has(transaction.accountId)) {
      cashFlows.push({
        ...transaction,
        id: `${transaction.id}-destination`,
        accountId: transaction.accountId,
        type: "income",
        isTransfer: false,
        isExcludedFromCalculation: false,
      });
    }
    if (
      transaction.transferTargetAccountId !== null &&
      bankAccountIds.has(transaction.transferTargetAccountId) &&
      !hasNormalTransactionMirror(transaction, normalTransactionKeys)
    ) {
      cashFlows.push({
        ...transaction,
        id: `${transaction.id}-source`,
        accountId: transaction.transferTargetAccountId,
        type: "expense",
        isTransfer: false,
        isExcludedFromCalculation: false,
      });
    }
  }

  return cashFlows;
}

function toActualEvent(transaction: BankCashFlowTransaction): BankCashFlowEventInput {
  return {
    id: `actual-${transaction.id}`,
    accountId: transaction.accountId,
    date: transaction.date,
    amount: Math.abs(transaction.amount),
    direction: transaction.type,
    status: "actual",
    description: transaction.description,
    classification: classifyRecurringTransaction(transaction),
    isExcludedFromCalculation: transaction.isExcludedFromCalculation,
  };
}

function getBalanceAsOfDate(lastUpdated: string | null, currentDate: string): string | null {
  const date = lastUpdated?.slice(0, 10);
  if (!date || date > currentDate || !date.startsWith(currentDate.slice(0, 7))) return null;

  try {
    parseIsoDateKey(date);
    return date;
  } catch {
    return null;
  }
}

function getBalanceAtForecastBoundary(forecast: BankBalanceForecast): number {
  let balance = forecast.openingBalance;
  for (const day of forecast.days) {
    for (const event of day.events) {
      if (event.status === "actual") balance = event.balanceAfter;
    }
  }
  return balance;
}

const CONFIRMED_CARD_IDENTITY_PREFIX = "confirmed-card-";

function isMirroredCandidateForConfirmedCard(
  candidate: RecurringCandidate,
  confirmed: RecurringCandidate,
  transactions: ForecastTransaction[],
): boolean {
  if (
    candidate.accountId !== confirmed.accountId ||
    candidate.type !== confirmed.type ||
    candidate.classification !== "card" ||
    !confirmed.recurringIdentity?.startsWith(CONFIRMED_CARD_IDENTITY_PREFIX)
  ) {
    return false;
  }

  const cardAccountId = Number(
    confirmed.recurringIdentity.slice(CONFIRMED_CARD_IDENTITY_PREFIX.length),
  );
  if (!Number.isInteger(cardAccountId)) return false;

  return transactions.some(
    (normalTransaction) =>
      normalTransaction.accountId === candidate.accountId &&
      normalTransaction.type !== "transfer" &&
      !normalTransaction.isTransfer &&
      normalTransaction.date >= candidate.evidence.dateRange.from &&
      normalTransaction.date <= candidate.evidence.dateRange.to &&
      matchesRecurringCandidateIdentity(candidate, normalTransaction) &&
      transactions.some(
        (transfer) =>
          transfer.accountId === cardAccountId &&
          transfer.transferTargetAccountId === candidate.accountId &&
          (transfer.type === "transfer" || transfer.isTransfer) &&
          transfer.date === normalTransaction.date &&
          Math.abs(transfer.amount) === Math.abs(normalTransaction.amount),
      ),
  );
}

export function buildBankCashFlowForecastViews(
  accounts: ForecastAccount[],
  transactions: ForecastTransaction[],
  currentDate: string,
  candidates?: RecurringCandidate[],
  cardLiabilities: ForecastCardLiability[] = [],
  dismissals: BankForecastDismissal[] = [],
): BankCashFlowForecastView[] {
  const bankAccounts = accounts.flatMap((account) => {
    if (account.categoryName !== "銀行") return [];

    const balanceAsOfDate = getBalanceAsOfDate(account.lastUpdated, currentDate);
    return balanceAsOfDate ? [{ ...account, balanceAsOfDate }] : [];
  });
  if (bankAccounts.length === 0) return [];

  const month = currentDate.slice(0, 7);
  const bankAccountIds = new Set(bankAccounts.map(({ id }) => id));
  const bankTransactions = toBankCashFlowTransactions(transactions, bankAccountIds);
  const cardLiabilityAmounts = new Map<number, number>();
  for (const { accountId, amount } of cardLiabilities) {
    cardLiabilityAmounts.set(accountId, (cardLiabilityAmounts.get(accountId) ?? 0) + amount);
  }
  const authoritativeCardAccountIds = new Set(
    accounts
      .filter(
        ({ id, categoryName, scheduledWithdrawalConfirmed }) =>
          categoryName === "カード" &&
          (scheduledWithdrawalConfirmed === true || cardLiabilityAmounts.has(id)),
      )
      .map(({ id }) => id),
  );
  const hasAuthoritativeCardWithdrawal = (transaction: ForecastTransaction) =>
    transaction.accountId !== null &&
    authoritativeCardAccountIds.has(transaction.accountId) &&
    transaction.transferTargetAccountId !== null &&
    bankAccountIds.has(transaction.transferTargetAccountId) &&
    (transaction.type === "transfer" || transaction.isTransfer);
  const candidateTransactions = toBankCashFlowTransactions(
    transactions.filter((transaction) => !hasAuthoritativeCardWithdrawal(transaction)),
    bankAccountIds,
  );
  const forecastCandidates =
    candidates ??
    (() => {
      const confirmedCandidates = generateConfirmedWithdrawalCandidates(
        accounts,
        transactions,
        bankAccountIds,
        month,
        cardLiabilityAmounts,
        currentDate,
      );
      const recurringCandidates = generateBankForecastCandidates(
        candidateTransactions,
        month,
      ).filter(
        (candidate) =>
          !confirmedCandidates.some((confirmed) =>
            isMirroredCandidateForConfirmedCard(candidate, confirmed, transactions),
          ),
      );
      return [...recurringCandidates, ...confirmedCandidates];
    })();
  const actualTransactions = bankTransactions.filter(
    ({ date }) => date.startsWith(month) && date <= currentDate,
  );
  const actualEvents = actualTransactions.map(toActualEvent);
  const eligibleCandidates = forecastCandidates.filter((candidate) => {
    const isDismissed = dismissals.some(
      (dismissal) =>
        dismissal.accountId === candidate.accountId &&
        dismissal.direction === candidate.type &&
        dismissal.recurringIdentity === candidate.recurringIdentity &&
        candidate.evidence.dateRange.to <= dismissal.dismissedThroughDate,
    );

    return (
      typeof candidate.accountId === "number" &&
      bankAccountIds.has(candidate.accountId) &&
      !isDismissed
    );
  });
  const forecastEvents = excludeRecordedCandidates(eligibleCandidates, actualTransactions).map(
    (candidate) => {
      const scheduledCandidate =
        candidate.predictedDate < currentDate
          ? { ...candidate, predictedDate: currentDate }
          : candidate;
      return recurringCandidateToBankCashFlowEvent(
        getForecastEventId(scheduledCandidate),
        scheduledCandidate,
      );
    },
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
    currentBalance: getBalanceAtForecastBoundary(forecast),
    accountName: accountNames.get(Number(forecast.accountId)) ?? "銀行口座",
  }));
}
