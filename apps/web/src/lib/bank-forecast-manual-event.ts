export const MAX_MANUAL_EVENT_AMOUNT = 1_000_000_000_000;

export function getManualEventMaxDate(today: string): string {
  const maximumYear = Number(today.slice(0, 4)) + 10;
  return `${String(maximumYear).padStart(4, "0")}${today.slice(4)}`;
}
