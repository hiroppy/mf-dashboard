import type { RecurringCandidate } from "@mf-dashboard/analytics/recurring-candidates";
import { describe, expect, it } from "vitest";
import { buildBankCashFlowForecastViews } from "./bank-cashflow-forecast-data";

const accounts = [
  { id: 1, name: "銀行 A", categoryName: "銀行", totalAssets: 100_000 },
  { id: 2, name: "証券 A", categoryName: "証券", totalAssets: 500_000 },
];

function transaction(
  id: number,
  overrides: Partial<{
    accountId: number | null;
    date: string;
    amount: number;
    type: string;
    description: string | null;
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
      candidate({ type: "income", classification: "salary", description: "給与振込" }),
      candidate({ predictedDate: "2026-08-01" }),
    ]);

    expect(forecasts[0]?.days.flatMap(({ events }) => events)).toMatchObject([
      { id: "actual-1", status: "actual" },
    ]);
    expect(forecasts[0]?.monthEndBalance).toBe(100_000);
  });

  it("銀行口座がなければ予測を返さない", () => {
    expect(
      buildBankCashFlowForecastViews([accounts[1]!], [transaction(1)], "2026-08-03", []),
    ).toEqual([]);
  });
});
