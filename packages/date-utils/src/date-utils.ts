export const JST_TIME_ZONE = "Asia/Tokyo";

export interface IsoDateParts {
  year: number;
  month: number;
  day: number;
}

export interface YearMonthParts {
  year: number;
  month: number;
}

export interface JstDateTimeDisplayOptions {
  includeYear?: boolean;
  includeSeconds?: boolean;
}

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const yearMonthPattern = /^(\d{4})-(\d{2})$/;

const jstDatePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: JST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function assertInteger(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
}

function assertYearMonth(parts: YearMonthParts): void {
  assertInteger(parts.year, "year");
  assertInteger(parts.month, "month");
  if (parts.month < 1 || parts.month > 12) {
    throw new Error(`Invalid month: ${parts.month}`);
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function getDaysInMonth(year: number, month: number): number {
  assertYearMonth({ year, month });
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatIsoDateKey(parts: IsoDateParts): string {
  assertYearMonth(parts);
  assertInteger(parts.day, "day");

  const maxDay = getDaysInMonth(parts.year, parts.month);
  if (parts.day < 1 || parts.day > maxDay) {
    throw new Error(`Invalid day: ${parts.day}`);
  }

  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function formatYearMonthKey(parts: YearMonthParts): string {
  assertYearMonth(parts);
  return `${parts.year}-${pad2(parts.month)}`;
}

export function parseIsoDateKey(dateKey: string): IsoDateParts {
  const match = dateKey.match(isoDatePattern);
  if (!match) {
    throw new Error(`Invalid ISO date key: ${dateKey}`);
  }

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  formatIsoDateKey(parts);
  return parts;
}

export function parseYearMonthKey(monthKey: string): YearMonthParts {
  const match = monthKey.match(yearMonthPattern);
  if (!match) {
    throw new Error(`Invalid year-month key: ${monthKey}`);
  }

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
  };
  assertYearMonth(parts);
  return parts;
}

export function getJstDateParts(date: Date = new Date()): IsoDateParts {
  const parts = jstDatePartsFormatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return { year, month, day };
}

export function getJstTodayIsoDate(date: Date = new Date()): string {
  return formatIsoDateKey(getJstDateParts(date));
}

export function getJstYearMonthKey(date: Date = new Date()): string {
  const { year, month } = getJstDateParts(date);
  return formatYearMonthKey({ year, month });
}

export function getDayOfWeekIsoDateKey(dateKey: string): number {
  const { year, month, day } = parseIsoDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDaysToIsoDateKey(dateKey: string, days: number): string {
  assertInteger(days, "days");
  const { year, month, day } = parseIsoDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatIsoDateKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function addMonthsToIsoDateKey(dateKey: string, months: number): string {
  assertInteger(months, "months");
  const { year, month, day } = parseIsoDateKey(dateKey);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;

  return formatIsoDateKey({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, getDaysInMonth(targetYear, targetMonth)),
  });
}

export function shiftYearMonthKey(monthKey: string, months: number): string {
  assertInteger(months, "months");
  const { year, month } = parseYearMonthKey(monthKey);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));

  return formatYearMonthKey({
    year: target.getUTCFullYear(),
    month: target.getUTCMonth() + 1,
  });
}

export function getEndOfMonthIsoDateKey(parts: YearMonthParts): string {
  return formatIsoDateKey({
    ...parts,
    day: getDaysInMonth(parts.year, parts.month),
  });
}

export function getEndOfPreviousMonthIsoDateKey(dateKey: string): string {
  const previousMonth = shiftYearMonthKey(dateKey.slice(0, 7), -1);
  return getEndOfMonthIsoDateKey(parseYearMonthKey(previousMonth));
}

export function formatJstDateTimeForDisplay(
  date: Date = new Date(),
  options: JstDateTimeDisplayOptions = {},
): string {
  const { includeYear = true, includeSeconds = true } = options;

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST_TIME_ZONE,
    year: includeYear ? "numeric" : undefined,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
  }).format(date);
}
