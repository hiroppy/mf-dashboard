export const BANK_FORECAST_ANCHOR_CHANGE_EVENT = "bank-forecast-anchor-change";

export function getBankForecastAnchorId(accountId: string | number): string {
  return `bank-forecast-account-${encodeURIComponent(String(accountId))}`;
}
