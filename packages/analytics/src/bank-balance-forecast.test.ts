import { describe, expect, it } from "vitest";
import {
  calculateBankBalanceForecasts,
  calculateMonthlyBankBalanceForecasts,
  recurringCandidateToBankCashFlowEvent,
  type BankBalanceAccount,
  type BankCashFlowEventInput,
} from "./bank-balance-forecast";

const currentDate = "2026-08-03";
const accountA: BankBalanceAccount = {
  accountId: "account-a",
  currentBalance: 100_000,
  balanceAsOfDate: currentDate,
};

function event(
  id: string,
  date: string,
  amount: number,
  direction: "income" | "expense",
  status: "actual" | "forecast",
  accountId: string | number = accountA.accountId,
): BankCashFlowEventInput {
  return { id, accountId, date, amount, direction, status };
}

describe("calculateMonthlyBankBalanceForecasts", () => {
  it("maps a recurring candidate to a forecast event", () => {
    const candidate = recurringCandidateToBankCashFlowEvent("candidate", {
      accountId: accountA.accountId,
      type: "expense",
      classification: "card",
      description: "Card payment",
      recurrenceIntervalMonths: 2,
      predictedDate: "2026-08-31",
      predictedAmount: 50_000,
      evidence: {
        occurrenceCount: 3,
        dateRange: { from: "2026-05-31", to: "2026-07-31" },
        amountRange: { min: 45_000, max: 55_000 },
      },
    });

    expect(candidate).toMatchObject({
      id: "candidate",
      direction: "expense",
      status: "forecast",
      classification: "card",
      evidence: { occurrenceCount: 3 },
      recurrenceIntervalMonths: 2,
    });
  });

  it("reconstructs the month opening balance and calculates actual and forecast balances", () => {
    const [forecast] = calculateMonthlyBankBalanceForecasts(
      [accountA],
      [
        event("opening-income", "2026-08-01", 20_000, "income", "actual"),
        event("actual-expense", currentDate, 5_000, "expense", "actual"),
        event("forecast-income", "2026-08-20", 30_000, "income", "forecast"),
        event("month-end-expense", "2026-08-31", 80_000, "expense", "forecast"),
      ],
      currentDate,
    );

    expect(forecast).toMatchObject({
      currentBalance: 100_000,
      forecastBoundaryDate: currentDate,
      monthStartDate: "2026-08-01",
      openingBalance: 85_000,
      forecastEndBalance: 50_000,
    });
    expect(forecast.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "opening-income", status: "actual", balanceAfter: 105_000 },
      { id: "actual-expense", status: "actual", balanceAfter: 100_000 },
      { id: "forecast-income", status: "forecast", balanceAfter: 130_000 },
      { id: "month-end-expense", status: "forecast", balanceAfter: 50_000 },
    ]);
  });

  it("preserves same-day detail order and closing balance", () => {
    const [forecast] = calculateMonthlyBankBalanceForecasts(
      [accountA],
      [
        event("first", "2026-08-10", 40_000, "expense", "forecast"),
        event("second", "2026-08-10", 10_000, "income", "forecast"),
        event("third", "2026-08-10", 70_000, "expense", "forecast"),
      ],
      currentDate,
    );

    expect(forecast.days).toEqual([
      {
        date: "2026-08-10",
        closingBalance: 0,
        events: [
          expect.objectContaining({ id: "first", balanceAfter: 60_000 }),
          expect.objectContaining({ id: "second", balanceAfter: 70_000 }),
          expect.objectContaining({ id: "third", balanceAfter: 0 }),
        ],
      },
    ]);
  });

  it("ignores movements excluded by existing transfer and calculation flags", () => {
    const excludedMovements: BankCashFlowEventInput[] = [
      {
        ...event("investment-transfer", "2026-08-15", 50_000, "expense", "forecast"),
        description: "Investment transfer",
        isTransfer: true,
      },
      {
        ...event("family-scope", "2026-08-16", 30_000, "income", "forecast"),
        description: "Family scope",
        isExcludedFromCalculation: true,
      },
      {
        ...event("corporate-scope", "2026-08-17", 20_000, "expense", "forecast"),
        description: "Corporate scope",
        isExcludedFromCalculation: true,
      },
      {
        ...event("pension-transfer", "2026-08-18", 10_000, "income", "forecast"),
        description: "Pension transfer",
        isTransfer: true,
      },
    ];
    const [forecast] = calculateMonthlyBankBalanceForecasts(
      [accountA],
      excludedMovements,
      currentDate,
    );

    expect(forecast.days).toEqual([]);
    expect(forecast.forecastEndBalance).toBe(100_000);
  });

  it("separates accounts and applies actual events posted after a stale balance anchor", () => {
    const accountB: BankBalanceAccount = {
      accountId: 2,
      currentBalance: 10_000,
      balanceAsOfDate: "2026-08-02",
    };
    const result = calculateMonthlyBankBalanceForecasts(
      [accountA, accountB],
      [
        event("account-a-event", "2026-08-04", 1_000, "income", "forecast"),
        event("account-b-actual", currentDate, 4_000, "expense", "actual", 2),
        event("account-b-forecast", "2026-08-31", 6_000, "expense", "forecast", 2),
      ],
      currentDate,
    );

    expect(
      result.map(({ accountId, openingBalance, forecastEndBalance }) => ({
        accountId,
        openingBalance,
        forecastEndBalance,
      })),
    ).toEqual([
      { accountId: "account-a", openingBalance: 100_000, forecastEndBalance: 101_000 },
      { accountId: 2, openingBalance: 10_000, forecastEndBalance: 0 },
    ]);
  });

  it("uses a previous-month balance as the opening balance for the forecast month", () => {
    const [forecast] = calculateMonthlyBankBalanceForecasts(
      [{ ...accountA, balanceAsOfDate: "2026-07-31" }],
      [
        event("actual", currentDate, 5_000, "income", "actual"),
        event("forecast", "2026-08-31", 10_000, "expense", "forecast"),
      ],
      currentDate,
    );

    expect(forecast).toMatchObject({
      openingBalance: 100_000,
      forecastEndBalance: 95_000,
    });
  });

  it("ignores events outside the current month", () => {
    const [forecast] = calculateMonthlyBankBalanceForecasts(
      [accountA],
      [
        event("cached-forecast", "2026-07-31", 50_000, "income", "forecast"),
        event("future-actual", "2026-09-01", 50_000, "expense", "actual"),
      ],
      currentDate,
    );

    expect(forecast).toMatchObject({
      days: [],
      openingBalance: 100_000,
      forecastEndBalance: 100_000,
    });
  });

  it("extends a forecast through a future one-off event when an end date is provided", () => {
    const [forecast] = calculateBankBalanceForecasts(
      [accountA],
      [event("future-tax", "2026-10-15", 30_000, "expense", "forecast")],
      currentDate,
      "2026-10-15",
    );

    expect(forecast).toMatchObject({
      forecastEndDate: "2026-10-15",
      openingBalance: 100_000,
      forecastEndBalance: 70_000,
      days: [
        {
          date: "2026-10-15",
          closingBalance: 70_000,
          events: [{ id: "future-tax", balanceAfter: 70_000 }],
        },
      ],
    });
  });

  it("rejects a forecast end before the boundary", () => {
    expect(() => calculateBankBalanceForecasts([accountA], [], currentDate, "2026-08-02")).toThrow(
      "forecastEndDate cannot be before",
    );
  });

  it.each([
    [event("future-actual", "2026-08-04", 1, "income", "actual"), "cannot be after"],
    [event("past-forecast", "2026-08-02", 1, "income", "forecast"), "cannot be before"],
    [event("negative", "2026-08-04", -1, "income", "forecast"), "must be non-negative"],
    [
      event("unsafe", "2026-08-04", Number.MAX_SAFE_INTEGER + 1, "income", "forecast"),
      "safe integer",
    ],
  ])("rejects an invalid event boundary or amount", (invalidEvent, message) => {
    expect(() =>
      calculateMonthlyBankBalanceForecasts([accountA], [invalidEvent], currentDate),
    ).toThrow(message);
  });

  it("allows today's overlapping boundary and orders actual events before forecasts", () => {
    const [forecast] = calculateMonthlyBankBalanceForecasts(
      [accountA],
      [
        event("today-forecast", currentDate, 100_000, "expense", "forecast"),
        event("today-actual", currentDate, 5_000, "income", "actual"),
      ],
      currentDate,
    );

    expect(forecast).toMatchObject({ openingBalance: 95_000, forecastEndBalance: 0 });
    expect(forecast.days[0]?.events).toMatchObject([
      { id: "today-actual", balanceAfter: 100_000 },
      { id: "today-forecast", balanceAfter: 0 },
    ]);
  });

  it.each([
    {
      name: "a future balance anchor",
      accounts: [{ ...accountA, balanceAsOfDate: "2026-08-04" }],
      events: [],
      message: "cannot be in the future",
    },
    {
      name: "an unknown account",
      accounts: [accountA],
      events: [event("unknown", "2026-08-04", 1, "income", "forecast", "missing")],
      message: "references an unknown account",
    },
  ])("rejects $name", ({ accounts, events, message }) => {
    expect(() => calculateMonthlyBankBalanceForecasts(accounts, events, currentDate)).toThrow(
      message,
    );
  });
});
