import { formatIsoDateKey, getDaysInMonth, parseIsoDateKey } from "@mf-dashboard/date-utils";
import type {
  RecurringCandidate,
  RecurringCandidateClassification,
  RecurringCandidateConfidence,
  RecurringCandidateEvidence,
} from "./recurring-candidates.js";

export type BankAccountId = string | number;
export type BankCashFlowDirection = "income" | "expense";
export type BankCashFlowStatus = "actual" | "forecast" | "needs_review";
export type BankCashFlowExclusionReason = "transfer" | "excluded_from_calculation";

export interface BankBalanceAccount {
  accountId: BankAccountId;
  currentBalance: number;
  balanceAsOfDate: string;
}

export interface BankCashFlowEventInput {
  id: string;
  accountId: BankAccountId;
  date: string;
  amount: number;
  direction: BankCashFlowDirection;
  status: BankCashFlowStatus;
  description?: string | null;
  classification?: RecurringCandidateClassification;
  confidence?: RecurringCandidateConfidence;
  evidence?: RecurringCandidateEvidence;
  isTransfer?: boolean;
  isExcludedFromCalculation?: boolean;
}

export interface CalculatedBankCashFlowEvent extends BankCashFlowEventInput {
  balanceAfter: number;
}

export interface ExcludedBankCashFlowEvent extends BankCashFlowEventInput {
  exclusionReason: BankCashFlowExclusionReason;
}

export interface BankCashFlowDay {
  date: string;
  incomeTotal: number;
  expenseTotal: number;
  netChange: number;
  closingBalance: number;
  events: CalculatedBankCashFlowEvent[];
}

export interface BankBalanceForecast {
  accountId: BankAccountId;
  currentBalance: number;
  balanceAsOfDate: string;
  forecastBoundaryDate: string;
  monthStartDate: string;
  monthEndDate: string;
  openingBalance: number;
  monthEndBalance: number;
  days: BankCashFlowDay[];
  excludedEvents: ExcludedBankCashFlowEvent[];
}

interface IndexedEvent {
  event: BankCashFlowEventInput;
  index: number;
}

function compareIndexedEvents(left: IndexedEvent, right: IndexedEvent): number {
  const dateComparison = left.event.date.localeCompare(right.event.date);
  if (dateComparison !== 0) return dateComparison;

  const leftIsActual = left.event.status === "actual";
  const rightIsActual = right.event.status === "actual";
  if (leftIsActual !== rightIsActual) return leftIsActual ? -1 : 1;
  return left.index - right.index;
}

export function recurringCandidateToBankCashFlowEvent(
  id: string,
  candidate: RecurringCandidate,
): BankCashFlowEventInput {
  return {
    id,
    accountId: candidate.accountId,
    date: candidate.predictedDate,
    amount: candidate.predictedAmount,
    direction: candidate.type,
    status: candidate.confidence === "low" ? "needs_review" : "forecast",
    description: candidate.description,
    classification: candidate.classification,
    confidence: candidate.confidence,
    evidence: candidate.evidence,
  };
}

function assertMoney(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer`);
  }
}

function addMoney(left: number, right: number, name: string): number {
  const result = left + right;
  assertMoney(result, name);
  return result;
}

function signedAmount(event: BankCashFlowEventInput): number {
  return event.direction === "income" ? event.amount : -event.amount;
}

function getExclusionReason(event: BankCashFlowEventInput): BankCashFlowExclusionReason | null {
  if (event.isTransfer) return "transfer";
  if (event.isExcludedFromCalculation) return "excluded_from_calculation";
  return null;
}

function validateEvent(event: BankCashFlowEventInput, currentDate: string): void {
  parseIsoDateKey(event.date);
  assertMoney(event.amount, `Event ${event.id} amount`);
  if (event.amount < 0) {
    throw new Error(`Event ${event.id} amount must be non-negative`);
  }
  if (event.status === "actual" && event.date > currentDate) {
    throw new Error(`Actual event ${event.id} cannot be after the forecast boundary`);
  }
  if (event.status !== "actual" && event.date < currentDate) {
    throw new Error(`Forecast event ${event.id} cannot be before the forecast boundary`);
  }
}

function calculateAccountForecast(
  account: BankBalanceAccount,
  indexedEvents: IndexedEvent[],
  currentDate: string,
  monthStartDate: string,
  monthEndDate: string,
): BankBalanceForecast {
  parseIsoDateKey(account.balanceAsOfDate);
  assertMoney(account.currentBalance, `Account ${String(account.accountId)} currentBalance`);
  if (account.balanceAsOfDate > currentDate) {
    throw new Error(`Account ${String(account.accountId)} balanceAsOfDate cannot be in the future`);
  }
  if (account.balanceAsOfDate < monthStartDate) {
    throw new Error(
      `Account ${String(account.accountId)} balanceAsOfDate must be in the current month`,
    );
  }

  const monthEvents = indexedEvents
    .filter(({ event }) => event.date >= monthStartDate && event.date <= monthEndDate)
    .sort(compareIndexedEvents);
  const includedEvents = monthEvents.filter(({ event }) => !getExclusionReason(event));
  const actualChangeThroughBalanceDate = includedEvents
    .filter(({ event }) => event.status === "actual" && event.date <= account.balanceAsOfDate)
    .reduce(
      (total, { event }) =>
        addMoney(total, signedAmount(event), "Actual balance change through balanceAsOfDate"),
      0,
    );
  const openingBalance = addMoney(
    account.currentBalance,
    -actualChangeThroughBalanceDate,
    "Opening balance",
  );

  let runningBalance = openingBalance;
  const days: BankCashFlowDay[] = [];
  for (const { event } of includedEvents) {
    runningBalance = addMoney(
      runningBalance,
      signedAmount(event),
      `Balance after event ${event.id}`,
    );
    const calculatedEvent = { ...event, balanceAfter: runningBalance };
    const currentDay = days.at(-1);

    if (currentDay?.date === event.date) {
      currentDay.events.push(calculatedEvent);
      if (event.direction === "income") {
        currentDay.incomeTotal = addMoney(currentDay.incomeTotal, event.amount, "Daily income");
      } else {
        currentDay.expenseTotal = addMoney(currentDay.expenseTotal, event.amount, "Daily expense");
      }
      currentDay.netChange = addMoney(
        currentDay.incomeTotal,
        -currentDay.expenseTotal,
        "Daily net change",
      );
      currentDay.closingBalance = runningBalance;
      continue;
    }

    days.push({
      date: event.date,
      incomeTotal: event.direction === "income" ? event.amount : 0,
      expenseTotal: event.direction === "expense" ? event.amount : 0,
      netChange: signedAmount(event),
      closingBalance: runningBalance,
      events: [calculatedEvent],
    });
  }

  const excludedEvents = monthEvents.flatMap(({ event }) => {
    const exclusionReason = getExclusionReason(event);
    return exclusionReason ? [{ ...event, exclusionReason }] : [];
  });

  return {
    accountId: account.accountId,
    currentBalance: account.currentBalance,
    balanceAsOfDate: account.balanceAsOfDate,
    forecastBoundaryDate: currentDate,
    monthStartDate,
    monthEndDate,
    openingBalance,
    monthEndBalance: runningBalance,
    days,
    excludedEvents,
  };
}

export function calculateMonthlyBankBalanceForecasts(
  accounts: BankBalanceAccount[],
  events: BankCashFlowEventInput[],
  currentDate: string,
): BankBalanceForecast[] {
  const { year, month } = parseIsoDateKey(currentDate);
  const monthStartDate = formatIsoDateKey({ year, month, day: 1 });
  const monthEndDate = formatIsoDateKey({ year, month, day: getDaysInMonth(year, month) });
  const accountIds = new Set<BankAccountId>();
  for (const account of accounts) {
    if (accountIds.has(account.accountId)) {
      throw new Error(`Duplicate accountId: ${String(account.accountId)}`);
    }
    accountIds.add(account.accountId);
  }

  const eventIds = new Set<string>();
  const eventsByAccount = new Map<BankAccountId, IndexedEvent[]>();
  events.forEach((event, index) => {
    validateEvent(event, currentDate);
    if (eventIds.has(event.id)) {
      throw new Error(`Duplicate event id: ${event.id}`);
    }
    eventIds.add(event.id);
    if (!accountIds.has(event.accountId)) {
      throw new Error(`Event ${event.id} references an unknown account`);
    }
    const accountEvents = eventsByAccount.get(event.accountId) ?? [];
    accountEvents.push({ event, index });
    eventsByAccount.set(event.accountId, accountEvents);
  });

  return accounts.map((account) =>
    calculateAccountForecast(
      account,
      eventsByAccount.get(account.accountId) ?? [],
      currentDate,
      monthStartDate,
      monthEndDate,
    ),
  );
}
