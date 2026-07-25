import { describe, expect, it } from "vitest";
import { roundToNice, getCutoffDate, filterDataByPeriod } from "./chart";

describe("roundToNice", () => {
  it("returns minimum value for zero or negative", () => {
    expect(roundToNice(0)).toBe(100000);
    expect(roundToNice(-100)).toBe(100000);
  });

  it("rounds small values correctly", () => {
    expect(roundToNice(1)).toBe(1);
    expect(roundToNice(1.1)).toBe(1.2);
    expect(roundToNice(1.3)).toBe(1.5);
    expect(roundToNice(1.8)).toBe(2);
    expect(roundToNice(2.3)).toBe(2.5);
    expect(roundToNice(2.8)).toBe(3);
  });

  it("handles different magnitudes", () => {
    expect(roundToNice(85)).toBe(100); // 8.5 -> 10 -> 100
    expect(roundToNice(850)).toBe(1000);
    expect(roundToNice(8500)).toBe(10000);

    expect(roundToNice(120)).toBe(120); // 1.2 -> 1.2 -> 120
    expect(roundToNice(150)).toBe(150);
    expect(roundToNice(180)).toBe(200);
  });

  it("handles realistic income/expense values", () => {
    expect(roundToNice(250000)).toBe(250000); // 25万 -> 2.5 * 100000
    expect(roundToNice(380000)).toBe(400000); // 38万 -> 4 * 100000
    expect(roundToNice(1200000)).toBe(1200000); // 120万 -> 1.2 * 1000000
    expect(roundToNice(1800000)).toBe(2000000); // 180万 -> 2 * 1000000
  });
});

describe("getCutoffDate", () => {
  const now = new Date(2025, 4, 15); // May 15, 2025

  it("returns null for all period", () => {
    expect(getCutoffDate("all", now)).toBe(null);
  });

  it("calculates 1 month ago", () => {
    const cutoff = getCutoffDate("1m", now);
    expect(cutoff?.getFullYear()).toBe(2025);
    expect(cutoff?.getMonth()).toBe(3); // April
    expect(cutoff?.getDate()).toBe(15);
  });

  it("calculates 3 months ago", () => {
    const cutoff = getCutoffDate("3m", now);
    expect(cutoff?.getFullYear()).toBe(2025);
    expect(cutoff?.getMonth()).toBe(1); // February
  });

  it("calculates 6 months ago", () => {
    const cutoff = getCutoffDate("6m", now);
    // JS Date automatically wraps: May - 6 = November of previous year
    expect(cutoff?.getMonth()).toBe(10); // November
    expect(cutoff?.getFullYear()).toBe(2024);
  });

  it("calculates 1 year ago", () => {
    const cutoff = getCutoffDate("1y", now);
    expect(cutoff?.getFullYear()).toBe(2024);
    expect(cutoff?.getMonth()).toBe(4); // May
  });
});

describe("filterDataByPeriod", () => {
  const testData = [
    { date: "2024-12-15", value: 100 },
    { date: "2024-12-20", value: 110 },
    { date: "2025-01-10", value: 120 },
    { date: "2025-01-28", value: 130 },
    { date: "2025-02-15", value: 140 },
    { date: "2025-03-10", value: 150 },
    { date: "2025-04-20", value: 160 },
    { date: "2025-05-10", value: 170 },
  ];

  const now = new Date(2025, 4, 15); // May 15, 2025

  it("returns all data for 'all' period", () => {
    const result = filterDataByPeriod(testData, "all", now);
    // Should keep last day of each month
    expect(result).toHaveLength(6); // 6 months
    expect(result[0].date).toBe("2024-12-20"); // Last day in December data
    expect(result[1].date).toBe("2025-01-28");
  });

  it("filters by 1 month and keeps all days", () => {
    const result = filterDataByPeriod(testData, "1m", now);
    // 1m keeps all days, not just last of month
    expect(result.every((d) => new Date(d.date) >= new Date(2025, 3, 15))).toBe(true);
  });

  it("filters by 3 months and aggregates to monthly", () => {
    const result = filterDataByPeriod(testData, "3m", now);
    // Should include February, March, April, May
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((d) => new Date(d.date) >= new Date(2025, 1, 15))).toBe(true);
  });

  it("keeps only last day of each month for non-1m periods", () => {
    const result = filterDataByPeriod(testData, "6m", now);

    // Check that each month appears only once
    const months = result.map((d) => d.date.slice(0, 7));
    const uniqueMonths = new Set(months);
    expect(months.length).toBe(uniqueMonths.size);
  });

  it("handles empty data", () => {
    const result = filterDataByPeriod([], "3m", now);
    expect(result).toHaveLength(0);
  });

  it("preserves data structure", () => {
    const dataWithExtra = [
      { date: "2025-05-01", value: 100, extra: "data" },
      { date: "2025-05-10", value: 110, extra: "more" },
    ];
    const result = filterDataByPeriod(dataWithExtra, "1m", now);
    expect(result[0]).toHaveProperty("extra");
  });
});
