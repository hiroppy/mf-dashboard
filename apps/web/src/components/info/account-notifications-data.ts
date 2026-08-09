import type { BankCashFlowForecastView } from "./bank-cashflow-forecast-data";

const LOW_BALANCE_THRESHOLD = 100_000;

export interface BalanceForecastAlert {
  accountId: BankCashFlowForecastView["accountId"];
  accountName: string;
  forecastBalance: number;
}

export function buildBalanceForecastAlerts(
  forecasts: BankCashFlowForecastView[],
): BalanceForecastAlert[] {
  return forecasts
    .flatMap(({ accountId, accountName, days, monthStartDate, openingBalance }) => {
      if (days.length === 0) return [];

      const month = monthStartDate.slice(0, 7);
      const monthEndBalance = days.reduce(
        (balance, day) => (day.date.startsWith(month) ? day.closingBalance : balance),
        openingBalance,
      );
      return monthEndBalance <= LOW_BALANCE_THRESHOLD
        ? [{ accountId, accountName, forecastBalance: monthEndBalance }]
        : [];
    })
    .sort((left, right) => left.forecastBalance - right.forecastBalance);
}
