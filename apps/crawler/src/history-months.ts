/**
 * History mode fetches months by calendar month, not by day offset.
 * Using Date#setMonth on month-end dates can roll over to the wrong month
 * (e.g. 2026-03-31 minus 1 month becomes 2026-03-03).
 */
export function getHistoryMonth(now: Date, monthsAgo: number): string {
  const date = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
