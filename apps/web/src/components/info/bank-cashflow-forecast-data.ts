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

interface ForecastAccount {
  id: number;
  name: string;
  categoryName: string;
  totalAssets: number;
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

function isCandidateAlreadyRecorded(
  candidate: RecurringCandidate,
  actualTransactions: ForecastTransaction[],
): boolean {
  const candidateDescription = normalizeDescription(candidate.description);
  if (!candidateDescription) return false;

  return actualTransactions.some(
    (transaction) =>
      transaction.accountId === candidate.accountId &&
      transaction.type === candidate.type &&
      normalizeDescription(transaction.description) === candidateDescription,
  );
}

export function buildBankCashFlowForecastViews(
  accounts: ForecastAccount[],
  transactions: ForecastTransaction[],
  currentDate: string,
  candidates?: RecurringCandidate[],
): BankCashFlowForecastView[] {
  const bankAccounts = accounts.filter(({ categoryName }) => categoryName === "銀行");
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
  const forecastEvents = forecastCandidates
    .filter(
      (candidate) =>
        typeof candidate.accountId === "number" &&
        bankAccountIds.has(candidate.accountId) &&
        candidate.predictedDate >= currentDate &&
        !isCandidateAlreadyRecorded(candidate, actualTransactions),
    )
    .map((candidate, index) =>
      recurringCandidateToBankCashFlowEvent(`forecast-${index}`, candidate),
    );

  const forecasts = calculateMonthlyBankBalanceForecasts(
    bankAccounts.map(({ id, totalAssets }) => ({
      accountId: id,
      currentBalance: totalAssets,
      balanceAsOfDate: currentDate,
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
