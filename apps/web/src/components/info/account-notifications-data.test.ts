import { describe, expect, it } from "vitest";
import { buildBalanceForecastAlerts } from "./account-notifications-data";
import type { BankCashFlowForecastView } from "./bank-cashflow-forecast-data";

function forecast(
  accountId: number,
  accountName: string,
  monthEndBalance: number,
): BankCashFlowForecastView {
  return {
    accountId,
    accountName,
    currentBalance: 150_000,
    forecastBoundaryDate: "2026-08-03",
    monthStartDate: "2026-08-01",
    openingBalance: 150_000,
    monthEndBalance,
    days: [],
  };
}

describe("buildBalanceForecastAlerts", () => {
  it("10万円以下の口座を予測残高が低い順に返す", () => {
    expect(
      buildBalanceForecastAlerts([
        forecast(1, "銀行 A", 100_001),
        forecast(2, "銀行 B", 100_000),
        forecast(3, "銀行 C", -20_000),
      ]),
    ).toEqual([
      { accountId: 3, accountName: "銀行 C", forecastBalance: -20_000 },
      { accountId: 2, accountName: "銀行 B", forecastBalance: 100_000 },
    ]);
  });

  it("対象口座がなければ空配列を返す", () => {
    expect(buildBalanceForecastAlerts([forecast(1, "銀行 A", 100_001)])).toEqual([]);
  });
});
