export function getBankForecastAnchorId(accountId: string | number): string {
  return `bank-forecast-account-${encodeURIComponent(String(accountId))}`;
}
