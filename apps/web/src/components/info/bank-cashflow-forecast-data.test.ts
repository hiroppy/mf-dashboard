import type { RecurringCandidate } from "@mf-dashboard/analytics/recurring-candidates";
import { describe, expect, it } from "vitest";
import { buildBankCashFlowForecastViews } from "./bank-cashflow-forecast-data";

const accounts = [
  {
    id: 1,
    name: "銀行 A",
    categoryName: "銀行",
    totalAssets: 100_000,
    lastUpdated: "2026-08-03T08:00:00",
  },
  {
    id: 2,
    name: "証券 A",
    categoryName: "証券",
    totalAssets: 500_000,
    lastUpdated: "2026-08-03T08:00:00",
  },
];

function transaction(
  id: number,
  overrides: Partial<{
    accountId: number | null;
    date: string;
    amount: number;
    type: string;
    description: string | null;
    category: string | null;
    subCategory: string | null;
    isTransfer: boolean;
    isExcludedFromCalculation: boolean;
  }> = {},
) {
  return {
    id,
    accountId: 1,
    date: "2026-08-02",
    amount: 5_000,
    type: "income",
    description: "給与振込",
    category: "収入",
    subCategory: "給与",
    isTransfer: false,
    isExcludedFromCalculation: false,
    ...overrides,
  };
}

function candidate(overrides: Partial<RecurringCandidate> = {}): RecurringCandidate {
  return {
    accountId: 1,
    type: "expense",
    classification: "rent",
    confidence: "high",
    description: "家賃",
    predictedDate: "2026-08-20",
    predictedAmount: 10_000,
    evidence: {
      lookbackMonths: 12,
      occurrenceCount: 3,
      dateRange: { from: "2026-05-20", to: "2026-07-20" },
      amountRange: { min: 10_000, max: 10_000 },
    },
    ...overrides,
  };
}

describe("buildBankCashFlowForecastViews", () => {
  it("銀行口座だけに当月実績と将来予測を反映する", () => {
    const forecasts = buildBankCashFlowForecastViews(accounts, [transaction(1)], "2026-08-03", [
      candidate(),
      candidate({ accountId: 2 }),
    ]);

    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]).toMatchObject({
      accountId: 1,
      accountName: "銀行 A",
      currentBalance: 100_000,
      openingBalance: 95_000,
      monthEndBalance: 90_000,
    });
    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual", balanceAfter: 100_000 },
      { id: "forecast-0", status: "forecast", balanceAfter: 90_000 },
    ]);
  });

  it("当月に記録済みの候補と過去日の予測を二重計上しない", () => {
    const forecasts = buildBankCashFlowForecastViews(accounts, [transaction(1)], "2026-08-03", [
      candidate({
        type: "income",
        classification: "salary",
        description: "給与振込",
        predictedDate: "2026-08-03",
        predictedAmount: 5_000,
      }),
      candidate({ predictedDate: "2026-08-01" }),
    ]);

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual" },
    ]);
    expect(forecasts[0]?.monthEndBalance).toBe(100_000);
  });

  it("残高更新日より後の実績を月末予測に反映する", () => {
    const staleAccount = { ...accounts[0]!, lastUpdated: "2026-08-01T08:00:00" };

    const forecasts = buildBankCashFlowForecastViews(
      [staleAccount],
      [transaction(1)],
      "2026-08-03",
      [],
    );

    expect(forecasts[0]).toMatchObject({
      balanceAsOfDate: "2026-08-01",
      openingBalance: 100_000,
      monthEndBalance: 105_000,
    });
  });

  it("説明なしの記録済み候補だけを一度だけ除外する", () => {
    const actual = transaction(1, {
      date: "2026-08-03",
      amount: 10_000,
      type: "expense",
      description: null,
      category: "家賃",
      subCategory: null,
    });
    const forecasts = buildBankCashFlowForecastViews(accounts, [actual], "2026-08-03", [
      candidate({ description: null, predictedDate: "2026-08-03" }),
      candidate({ description: null, predictedDate: "2026-08-03" }),
    ]);

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual" },
      { id: "forecast-0", status: "forecast" },
    ]);
    expect(forecasts[0]?.monthEndBalance).toBe(90_000);
  });

  it("同じ説明でも金額または予定日が異なる候補は残す", () => {
    const actual = transaction(1, {
      date: "2026-08-03",
      amount: -10_000,
      type: "expense",
      description: "口座振替",
      category: null,
      subCategory: null,
    });
    const forecasts = buildBankCashFlowForecastViews(accounts, [actual], "2026-08-03", [
      candidate({
        classification: "other",
        description: "口座振替",
        predictedDate: "2026-08-03",
      }),
      candidate({
        classification: "other",
        description: "口座振替",
        predictedDate: "2026-08-20",
        predictedAmount: 30_000,
      }),
    ]);

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual" },
      { id: "forecast-0", status: "forecast", amount: 30_000 },
    ]);
  });

  it("当月内の有効な残高更新日がない銀行口座は予測しない", () => {
    expect(
      buildBankCashFlowForecastViews(
        [{ ...accounts[0]!, lastUpdated: "2026-07-31" }],
        [transaction(1)],
        "2026-08-03",
        [],
      ),
    ).toEqual([]);
  });

  it("銀行口座がなければ予測を返さない", () => {
    expect(
      buildBankCashFlowForecastViews([accounts[1]!], [transaction(1)], "2026-08-03", []),
    ).toEqual([]);
  });
});
