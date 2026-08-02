import { getJstYearMonthKey, parseYearMonthKey, shiftYearMonthKey } from "@mf-dashboard/date-utils";

/**
 * History mode fetches months by calendar month, not by day offset.
 * Using Date#setMonth on month-end dates can roll over to the wrong month
 * (e.g. 2026-03-31 minus 1 month becomes 2026-03-03).
 * Money Forward dates are handled in Japan time even when CI runs in UTC.
 */
export function getHistoryMonth(now: Date, monthsAgo: number): string {
  return getHistoryMonthFromAnchor(getJstYearMonthKey(now), monthsAgo);
}

export function getHistoryMaxMonths(now: Date): number {
  return getHistoryMaxMonthsFromAnchor(getJstYearMonthKey(now));
}

export function getHistoryMonthFromAnchor(anchorMonth: string, monthsAgo: number): string {
  return shiftYearMonthKey(anchorMonth, -monthsAgo);
}

export function getHistoryMaxMonthsFromAnchor(anchorMonth: string): number {
  const { month } = parseYearMonthKey(anchorMonth);
  return month + 12;
}
