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
    .filter(
      ({ days, monthEndBalance }) => days.length > 0 && monthEndBalance <= LOW_BALANCE_THRESHOLD,
    )
    .map(({ accountId, accountName, monthEndBalance }) => ({
      accountId,
      accountName,
      forecastBalance: monthEndBalance,
    }))
    .sort((left, right) => left.forecastBalance - right.forecastBalance);
}
