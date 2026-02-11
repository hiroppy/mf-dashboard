import { describe, it, expect, vi, afterEach } from "vitest";
import {
  calcChangeRate,
  calcStreak,
  calcAverage,
  calcMedian,
  calcStdDev,
  calcSavingsRate,
  calcLinearSlope,
  getCurrentMonth,
  excludeCurrentMonth,
} from "./analyzer-utils";

describe("getCurrentMonth", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return YYYY-MM format", () => {
    vi.useFakeTimers({ now: new Date("2025-06-15T12:00:00Z") });
    expect(getCurrentMonth()).toBe("2025-06");
  });

  it("should pad single-digit months", () => {
    vi.useFakeTimers({ now: new Date("2025-03-01T00:00:00Z") });
    expect(getCurrentMonth()).toBe("2025-03");
  });
});

describe("excludeCurrentMonth", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should exclude items matching the current month", () => {
    vi.useFakeTimers({ now: new Date("2025-06-15T12:00:00Z") });
    const items = [
      { month: "2025-04", value: 1 },
      { month: "2025-05", value: 2 },
      { month: "2025-06", value: 3 },
    ];
    const result = excludeCurrentMonth(items);
    expect(result).toEqual([
      { month: "2025-04", value: 1 },
      { month: "2025-05", value: 2 },
    ]);
  });

  it("should return all items if none match current month", () => {
    vi.useFakeTimers({ now: new Date("2025-06-15T12:00:00Z") });
    const items = [
      { month: "2025-04", value: 1 },
      { month: "2025-05", value: 2 },
    ];
    const result = excludeCurrentMonth(items);
    expect(result).toEqual(items);
  });

  it("should return empty array if all items are current month", () => {
    vi.useFakeTimers({ now: new Date("2025-06-15T12:00:00Z") });
    const items = [{ month: "2025-06", value: 1 }];
    const result = excludeCurrentMonth(items);
    expect(result).toEqual([]);
  });

  it("should return empty array for empty input", () => {
    const result = excludeCurrentMonth([]);
    expect(result).toEqual([]);
  });
});

describe("calcChangeRate", () => {
  it("should return null when previous is 0", () => {
    expect(calcChangeRate(100, 0)).toBeNull();
  });

  it("should calculate positive change", () => {
    expect(calcChangeRate(120, 100)).toBe(20);
  });

  it("should calculate negative change", () => {
    expect(calcChangeRate(80, 100)).toBe(-20);
  });
});

describe("calcStreak", () => {
  it("should return none for fewer than 2 values", () => {
    expect(calcStreak([1])).toEqual({ direction: "none", months: 0 });
  });

  it("should detect increasing streak", () => {
    expect(calcStreak([1, 2, 3])).toEqual({ direction: "increasing", months: 2 });
  });

  it("should detect decreasing streak", () => {
    expect(calcStreak([3, 2, 1])).toEqual({ direction: "decreasing", months: 2 });
  });
});

describe("calcAverage", () => {
  it("should return 0 for empty array", () => {
    expect(calcAverage([])).toBe(0);
  });

  it("should calculate average", () => {
    expect(calcAverage([10, 20, 30])).toBe(20);
  });
});

describe("calcMedian", () => {
  it("should return 0 for empty array", () => {
    expect(calcMedian([])).toBe(0);
  });

  it("should return middle value for odd length", () => {
    expect(calcMedian([1, 3, 2])).toBe(2);
  });

  it("should return average of two middle values for even length", () => {
    expect(calcMedian([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("calcStdDev", () => {
  it("should return 0 for fewer than 2 values", () => {
    expect(calcStdDev([1], 1)).toBe(0);
  });
});

describe("calcSavingsRate", () => {
  it("should return 0 when income is 0", () => {
    expect(calcSavingsRate(0, 100)).toBe(0);
  });

  it("should calculate savings rate", () => {
    expect(calcSavingsRate(100, 60)).toBe(40);
  });
});

describe("calcLinearSlope", () => {
  it("should return 0 for fewer than 3 values", () => {
    expect(calcLinearSlope([1, 2])).toBe(0);
  });
});
