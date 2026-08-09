import { describe, expect, it } from "vitest";
import { buildBalanceForecastAlerts } from "./account-notifications-data";
import type { BankCashFlowForecastView } from "./bank-cashflow-forecast-data";

function forecast(
  accountId: number,
  accountName: string,
  forecastEndBalance: number,
  hasBalanceTrend = true,
): BankCashFlowForecastView {
  return {
    accountId,
    accountName,
    currentBalance: 150_000,
    forecastBoundaryDate: "2026-08-03",
    monthStartDate: "2026-08-01",
    forecastEndDate: "2026-08-31",
    openingBalance: 150_000,
    forecastEndBalance,
    days: hasBalanceTrend
      ? [
          {
            date: "2026-08-20",
            closingBalance: forecastEndBalance,
            events: [
              {
                id: `forecast-${accountId}`,
                accountId,
                date: "2026-08-20",
                amount: 50_000,
                direction: "expense",
                status: "forecast",
                balanceAfter: forecastEndBalance,
              },
            ],
          },
        ]
      : [],
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

  it("残高推移がない口座は閾値以下でも返さない", () => {
    expect(buildBalanceForecastAlerts([forecast(1, "銀行 A", -20_000, false)])).toEqual([]);
  });
});
