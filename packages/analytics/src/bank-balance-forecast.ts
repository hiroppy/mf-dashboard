import { formatIsoDateKey, getDaysInMonth, parseIsoDateKey } from "@mf-dashboard/date-utils";
import type {
  RecurringCandidate,
  RecurringCandidateClassification,
  RecurringCandidateEvidence,
} from "./recurring-candidates.js";

type BankAccountId = string | number;
export type BankCashFlowDirection = "income" | "expense";
export type BankCashFlowStatus = "actual" | "forecast";

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
  evidence?: RecurringCandidateEvidence;
  recurringIdentity?: string;
  amountSource?: "scheduled_withdrawal" | "liability";
  isTransfer?: boolean;
  isExcludedFromCalculation?: boolean;
}

export interface CalculatedBankCashFlowEvent extends BankCashFlowEventInput {
  balanceAfter: number;
}

interface BankCashFlowDay {
  date: string;
  closingBalance: number;
  events: CalculatedBankCashFlowEvent[];
}

export interface BankBalanceForecast {
  accountId: BankAccountId;
  currentBalance: number;
  forecastBoundaryDate: string;
  monthStartDate: string;
  openingBalance: number;
  monthEndBalance: number;
  days: BankCashFlowDay[];
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
    status: "forecast",
    description: candidate.description,
    classification: candidate.classification,
    evidence: candidate.evidence,
    recurringIdentity: candidate.recurringIdentity,
    amountSource: candidate.amountSource,
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

function isExcluded(event: BankCashFlowEventInput): boolean {
  return Boolean(event.isTransfer || event.isExcludedFromCalculation);
}

function validateEvent(event: BankCashFlowEventInput, currentDate: string): void {
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

  const monthEvents = indexedEvents
    .filter(({ event }) => event.date >= monthStartDate && event.date <= monthEndDate)
    .sort(compareIndexedEvents);
  const includedEvents = monthEvents.filter(({ event }) => !isExcluded(event));
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
      currentDay.closingBalance = runningBalance;
      continue;
    }

    days.push({
      date: event.date,
      closingBalance: runningBalance,
      events: [calculatedEvent],
    });
  }

  return {
    accountId: account.accountId,
    currentBalance: account.currentBalance,
    forecastBoundaryDate: currentDate,
    monthStartDate,
    openingBalance,
    monthEndBalance: runningBalance,
    days,
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
    parseIsoDateKey(event.date);
    if (event.date < monthStartDate || event.date > monthEndDate) return;
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
