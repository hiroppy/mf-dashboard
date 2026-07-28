import { describe, expect, it } from "vitest";
import {
  JST_TIME_ZONE,
  addDaysToIsoDateKey,
  addMonthsToIsoDateKey,
  formatIsoDateKey,
  formatJstDateTimeForDisplay,
  formatYearMonthKey,
  getDayOfWeekIsoDateKey,
  getDaysInMonth,
  getEndOfPreviousMonthIsoDateKey,
  getJstDateParts,
  getJstTodayIsoDate,
  getJstYearMonthKey,
  parseIsoDateKey,
  parseYearMonthKey,
  shiftYearMonthKey,
} from "./date-utils";

describe("JST date keys", () => {
  it("uses the Asia/Tokyo timezone", () => {
    expect(JST_TIME_ZONE).toBe("Asia/Tokyo");
    expect(getJstDateParts(new Date("2025-03-31T15:00:00.000Z"))).toEqual({
      year: 2025,
      month: 4,
      day: 1,
    });
  });

  it("uses JST today across the UTC day boundary", () => {
    expect(getJstTodayIsoDate(new Date("2025-03-31T14:59:59.000Z"))).toBe("2025-03-31");
    expect(getJstTodayIsoDate(new Date("2025-03-31T15:00:00.000Z"))).toBe("2025-04-01");
  });

  it("uses JST year-month across month and year boundaries", () => {
    expect(getJstYearMonthKey(new Date("2025-03-31T15:00:00.000Z"))).toBe("2025-04");
    expect(getJstYearMonthKey(new Date("2025-12-31T15:00:00.000Z"))).toBe("2026-01");
  });
});

describe("ISO date key helpers", () => {
  it("formats and parses ISO date keys without Date timezone parsing", () => {
    expect(formatIsoDateKey({ year: 2025, month: 4, day: 5 })).toBe("2025-04-05");
    expect(parseIsoDateKey("2025-04-05")).toEqual({ year: 2025, month: 4, day: 5 });
  });

  it("preserves four-digit years below 1000", () => {
    expect(formatIsoDateKey({ year: 20, month: 1, day: 1 })).toBe("0020-01-01");
    expect(formatYearMonthKey({ year: 20, month: 1 })).toBe("0020-01");
    expect(formatYearMonthKey({ year: 9999, month: 12 })).toBe("9999-12");
  });

  it("preserves years 0-99 in UTC calendar arithmetic", () => {
    expect(getDaysInMonth(0, 2)).toBe(29);
    expect(formatIsoDateKey({ year: 0, month: 2, day: 29 })).toBe("0000-02-29");
  });

  it("formats and parses year-month keys", () => {
    expect(formatYearMonthKey({ year: 2025, month: 4 })).toBe("2025-04");
    expect(parseYearMonthKey("2025-04")).toEqual({ year: 2025, month: 4 });
  });

  it("rejects invalid date keys", () => {
    expect(() => formatIsoDateKey({ year: 2025, month: 2, day: 29 })).toThrow("Invalid day");
    expect(() => formatIsoDateKey({ year: 2025, month: 1, day: 0 })).toThrow("Invalid day: 0");
    expect(() => formatIsoDateKey({ year: 2025.5, month: 1, day: 1 })).toThrow(
      "Invalid year: 2025.5",
    );
    expect(() => formatIsoDateKey({ year: 2025, month: 1.5, day: 1 })).toThrow(
      "Invalid month: 1.5",
    );
    expect(() => formatIsoDateKey({ year: 2025, month: 1, day: 1.5 })).toThrow("Invalid day: 1.5");
    expect(() => formatYearMonthKey({ year: -1, month: 1 })).toThrow("Invalid year: -1");
    expect(() => formatYearMonthKey({ year: 10_000, month: 1 })).toThrow("Invalid year: 10000");
    expect(() => formatYearMonthKey({ year: 2025, month: 0 })).toThrow("Invalid month: 0");
    expect(() => parseIsoDateKey("2025-2-9")).toThrow("Invalid ISO date key");
    expect(() => parseIsoDateKey("x2025-02-09")).toThrow("Invalid ISO date key");
    expect(() => parseIsoDateKey("2025-02-09x")).toThrow("Invalid ISO date key");
    expect(() => parseYearMonthKey("x2025-02")).toThrow("Invalid year-month key");
    expect(() => parseYearMonthKey("2025-02x")).toThrow("Invalid year-month key");
    expect(() => parseYearMonthKey("2025-13")).toThrow("Invalid month");
  });

  it("rejects non-integer shifts", () => {
    expect(() => addDaysToIsoDateKey("2025-01-01", 1.5)).toThrow("Invalid days: 1.5");
    expect(() => addMonthsToIsoDateKey("2025-01-01", 1.5)).toThrow("Invalid months: 1.5");
    expect(() => shiftYearMonthKey("2025-01", 1.5)).toThrow("Invalid months: 1.5");
  });

  it("adds days over month and year boundaries in calendar-date space", () => {
    expect(addDaysToIsoDateKey("2025-03-01", -1)).toBe("2025-02-28");
    expect(addDaysToIsoDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("adds months and clamps to month end", () => {
    expect(addMonthsToIsoDateKey("2025-03-31", -1)).toBe("2025-02-28");
    expect(addMonthsToIsoDateKey("2024-03-31", -1)).toBe("2024-02-29");
  });

  it("calculates previous month end across year boundaries", () => {
    expect(getEndOfPreviousMonthIsoDateKey("2025-03-31")).toBe("2025-02-28");
    expect(getEndOfPreviousMonthIsoDateKey("2026-01-15")).toBe("2025-12-31");
  });

  it("validates the full date before calculating previous month end", () => {
    expect(() => getEndOfPreviousMonthIsoDateKey("2025-02-99")).toThrow("Invalid day");
  });

  it("shifts year-month keys across years", () => {
    expect(shiftYearMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftYearMonthKey("2025-12", 1)).toBe("2026-01");
  });

  it("gets day of week from an ISO date key", () => {
    expect(getDayOfWeekIsoDateKey("2025-04-01")).toBe(2);
  });
});

describe("JST display formatter", () => {
  it("includes the year and seconds by default", () => {
    expect(formatJstDateTimeForDisplay(new Date("2025-04-30T01:30:00.000Z"))).toBe(
      "2025/4/30 10:30:00",
    );
  });

  it("formats date-time for display in JST", () => {
    expect(
      formatJstDateTimeForDisplay(new Date("2025-04-30T01:30:00.000Z"), {
        includeYear: false,
        includeSeconds: false,
      }),
    ).toContain("10:30");
  });
});
