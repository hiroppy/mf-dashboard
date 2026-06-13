/**
 * History mode fetches months by calendar month, not by day offset.
 * Using Date#setMonth on month-end dates can roll over to the wrong month
 * (e.g. 2026-03-31 minus 1 month becomes 2026-03-03).
 * Money Forward dates are handled in Japan time even when CI runs in UTC.
 */
export function getHistoryMonth(now: Date, monthsAgo: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const date = new Date(Date.UTC(year, month - 1 - monthsAgo, 1));

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
