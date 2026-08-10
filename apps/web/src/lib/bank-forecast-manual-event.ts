import { formatIsoDateKey, getDaysInMonth, parseIsoDateKey } from "@mf-dashboard/date-utils";

export const MAX_MANUAL_EVENT_AMOUNT = 1_000_000_000_000;

export function getManualEventMaxDate(today: string): string {
  const { year, month, day } = parseIsoDateKey(today);
  const maximumYear = year + 10;

  return formatIsoDateKey({
    year: maximumYear,
    month,
    day: Math.min(day, getDaysInMonth(maximumYear, month)),
  });
}
