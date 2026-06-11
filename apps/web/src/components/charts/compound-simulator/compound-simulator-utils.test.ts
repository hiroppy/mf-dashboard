import { describe, expect, test } from "vitest";
import type { YearlyProjection } from "./calculate-compound";
import {
  getLabelMap,
  selectMilestones,
  getTimelinePattern,
  computeSummaryYear,
  computeMonthlyWithdrawalForSummary,
  computeRateWithdrawalBasis,
  computeMcDrawdownEndValue,
  computeTotalWithdrawalAmount,
  buildFanChartData,
  computeTotalYears,
  computeWithdrawalMilestones,
  computeSecurityScore,
  getSecurityLabel,
  MILESTONE_CANDIDATES,
} from "./compound-simulator-utils";
import type { MonteCarloYearData } from "./simulate-monte-carlo";

describe("getLabelMap", () => {
  test("returns tax-free labels when taxFree is true", () => {
    const map = getLabelMap(true);
    expect(map.principal).toBe("元本");
    expect(map.interest).toBe("運用益");
    expect(map.tax).toBe("税金");
  });

  test("returns taxed labels when taxFree is false", () => {
    const map = getLabelMap(false);
    expect(map.interest).toBe("運用益（税引後）");
  });
});

describe("selectMilestones", () => {
  test("returns milestones within 5%-95% of maxValue", () => {
    const result = selectMilestones(60_000_000);
    expect(result).toEqual([10_000_000, 20_000_000]);
  });

  test("returns empty array when maxValue is too small", () => {
    const result = selectMilestones(100_000);
    expect(result).toEqual([]);
  });

  test("returns at most 2 milestones", () => {
    const result = selectMilestones(500_000_000);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  test("filters out milestones too close to maxValue", () => {
    // maxValue = 10_500_000 → 95% = 9_975_000 → 10M is excluded
    const result = selectMilestones(10_500_000);
    expect(result).toEqual([]);
  });

  test("MILESTONE_CANDIDATES is exported correctly", () => {
    expect(MILESTONE_CANDIDATES).toEqual([
      10_000_000, 20_000_000, 50_000_000, 100_000_000, 200_000_000,
    ]);
  });
});

describe("getTimelinePattern", () => {
  test("contribution only", () => {
    expect(getTimelinePattern(20, 20, 0)).toBe("積立のみ（積立20年）");
  });

  test("contribution then withdrawal", () => {
    expect(getTimelinePattern(20, 20, 25)).toBe("積立 → 切り崩し（積立20年・切り崩し25年）");
  });

  test("contribution then idle then withdrawal", () => {
    expect(getTimelinePattern(20, 30, 25)).toBe(
      "積立 → 据え置き → 切り崩し（積立20年・据え置き10年・切り崩し25年）",
    );
  });

  test("immediate withdrawal only (no contribution)", () => {
    expect(getTimelinePattern(0, 0, 30)).toBe("切り崩しのみ（切り崩し30年）");
  });

  test("overlap: contribution and withdrawal at the same time", () => {
    expect(getTimelinePattern(20, 10, 20)).toBe("積立+切り崩し（積立20年・切り崩し20年）");
  });

  test("zero everything returns 積立のみ", () => {
    expect(getTimelinePattern(0, 0, 0)).toBe("積立のみ");
  });
});

describe("computeSummaryYear", () => {
  test("returns contributionYears when no withdrawal", () => {
    expect(computeSummaryYear(20, 20, 0)).toBe(20);
  });

  test("returns withdrawalStartYear with withdrawal (idle gap)", () => {
    expect(computeSummaryYear(20, 30, 25)).toBe(30);
  });

  test("returns withdrawalStartYear when overlap (withdrawal starts before contribution ends)", () => {
    expect(computeSummaryYear(20, 10, 10)).toBe(10);
  });

  test("returns withdrawalStartYear when larger than contributionYears", () => {
    expect(computeSummaryYear(10, 20, 15)).toBe(20);
  });
});

describe("computeMonthlyWithdrawalForSummary", () => {
  const projections: YearlyProjection[] = [
    {
      year: 0,
      principal: 0,
      interest: 0,
      tax: 0,
      total: 0,
      yearlyWithdrawal: 0,
      isContributing: true,
      isWithdrawing: false,
    },
    {
      year: 20,
      principal: 10_000_000,
      interest: 5_000_000,
      tax: 0,
      total: 15_000_000,
      yearlyWithdrawal: 0,
      isContributing: true,
      isWithdrawing: false,
    },
    {
      year: 21,
      principal: 10_000_000,
      interest: 5_000_000,
      tax: 0,
      total: 14_400_000,
      yearlyWithdrawal: 600_000,
      isContributing: false,
      isWithdrawing: true,
    },
  ];

  test("rate mode: calculates monthly from yearlyWithdrawal at withdrawalStartYear+1", () => {
    const result = computeMonthlyWithdrawalForSummary("rate", projections, 20, 0);
    expect(result).toBe(50_000); // 600_000 / 12
  });

  test("amount mode: returns fixed amount directly", () => {
    const result = computeMonthlyWithdrawalForSummary("amount", projections, 20, 150_000);
    expect(result).toBe(150_000);
  });

  test("rate mode: returns 0 when projection not found", () => {
    const result = computeMonthlyWithdrawalForSummary("rate", projections, 99, 0);
    expect(result).toBe(0);
  });
});

describe("computeRateWithdrawalBasis", () => {
  test("uses gross portfolio value so taxable rate-mode display matches calculation basis", () => {
    const projection: YearlyProjection = {
      year: 5,
      principal: 10_000_000,
      interest: 6_074_720,
      tax: 1_548_697,
      total: 16_074_720,
      yearlyWithdrawal: 0,
      isContributing: false,
      isWithdrawing: false,
    };

    expect(computeRateWithdrawalBasis(projection)).toBe(17_623_417);
  });

  test("matches total for tax-free projections", () => {
    const projection: YearlyProjection = {
      year: 5,
      principal: 10_000_000,
      interest: 7_623_417,
      tax: 0,
      total: 17_623_417,
      yearlyWithdrawal: 0,
      isContributing: false,
      isWithdrawing: false,
    };

    expect(computeRateWithdrawalBasis(projection)).toBe(projection.total);
  });
});

describe("computeMcDrawdownEndValue", () => {
  const yearlyData: MonteCarloYearData[] = [
    {
      year: 20,
      p10: 1000,
      p25: 2000,
      p50: 3000,
      p75: 4000,
      p90: 5000,
      principal: 800,
      isContributing: false,
      isWithdrawing: false,
    },
    {
      year: 21,
      p10: 900,
      p25: 1800,
      p50: 2700,
      p75: 3600,
      p90: 4500,
      principal: 700,
      isContributing: false,
      isWithdrawing: true,
    },
    {
      year: 22,
      p10: 800,
      p25: 1600,
      p50: 2400,
      p75: 3200,
      p90: 4000,
      principal: 600,
      isContributing: false,
      isWithdrawing: true,
    },
  ];

  test("returns last withdrawing year value at specified percentile", () => {
    expect(computeMcDrawdownEndValue(10, yearlyData, "p50")).toBe(2400);
    expect(computeMcDrawdownEndValue(10, yearlyData, "p10")).toBe(800);
    expect(computeMcDrawdownEndValue(10, yearlyData, "p90")).toBe(4000);
  });

  test("returns undefined when withdrawalYears is 0", () => {
    expect(computeMcDrawdownEndValue(0, yearlyData, "p50")).toBeUndefined();
  });

  test("returns undefined when no withdrawing data", () => {
    const noWithdrawing: MonteCarloYearData[] = [
      {
        year: 1,
        p10: 100,
        p25: 200,
        p50: 300,
        p75: 400,
        p90: 500,
        principal: 100,
        isContributing: true,
        isWithdrawing: false,
      },
    ];
    expect(computeMcDrawdownEndValue(10, noWithdrawing, "p50")).toBeUndefined();
  });
});

describe("computeTotalWithdrawalAmount", () => {
  const projections: YearlyProjection[] = [
    {
      year: 1,
      principal: 0,
      interest: 0,
      tax: 0,
      total: 0,
      yearlyWithdrawal: 0,
      isContributing: true,
      isWithdrawing: false,
    },
    {
      year: 2,
      principal: 0,
      interest: 0,
      tax: 0,
      total: 0,
      yearlyWithdrawal: 100_000,
      isContributing: false,
      isWithdrawing: true,
    },
    {
      year: 3,
      principal: 0,
      interest: 0,
      tax: 0,
      total: 0,
      yearlyWithdrawal: 100_000,
      isContributing: false,
      isWithdrawing: true,
    },
  ];

  test("sums yearlyWithdrawal for withdrawing years", () => {
    expect(computeTotalWithdrawalAmount(2, projections)).toBe(200_000);
  });

  test("returns 0 when withdrawalYears is 0", () => {
    expect(computeTotalWithdrawalAmount(0, projections)).toBe(0);
  });

  test("returns 0 when withdrawalYears is negative", () => {
    expect(computeTotalWithdrawalAmount(-1, projections)).toBe(0);
  });
});

describe("buildFanChartData", () => {
  test("correctly computes band values", () => {
    const input: MonteCarloYearData[] = [
      {
        year: 0,
        p10: 100,
        p25: 200,
        p50: 400,
        p75: 700,
        p90: 1000,
        principal: 100,
        isContributing: true,
        isWithdrawing: false,
      },
    ];
    const result = buildFanChartData(input);
    expect(result).toHaveLength(1);
    const d = result[0];
    expect(d.base).toBe(100);
    expect(d.band_outer_lower).toBe(100); // p25 - p10
    expect(d.band_inner_lower).toBe(200); // p50 - p25
    expect(d.band_inner_upper).toBe(300); // p75 - p50
    expect(d.band_outer_upper).toBe(300); // p90 - p75
  });

  test("returns empty array for empty input", () => {
    expect(buildFanChartData([])).toEqual([]);
  });

  test("preserves flags from source data", () => {
    const input: MonteCarloYearData[] = [
      {
        year: 5,
        p10: 0,
        p25: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        principal: 0,
        isContributing: false,
        isWithdrawing: true,
        depletionRate: 0.1,
      },
    ];
    const result = buildFanChartData(input);
    expect(result[0].isContributing).toBe(false);
    expect(result[0].isWithdrawing).toBe(true);
    expect(result[0].depletionRate).toBe(0.1);
  });
});

describe("computeWithdrawalMilestones", () => {
  const mkProj = (year: number, yearlyWithdrawal: number): YearlyProjection => ({
    year,
    principal: 0,
    interest: 0,
    tax: 0,
    total: 0,
    yearlyWithdrawal,
    isContributing: false,
    isWithdrawing: year > 20,
  });

  const projections: YearlyProjection[] = [
    mkProj(20, 0),
    mkProj(21, 1_200_000),
    mkProj(25, 1_100_000),
    mkProj(30, 1_000_000),
    mkProj(35, 900_000),
    mkProj(40, 800_000),
    mkProj(50, 600_000),
  ];

  test("returns milestones at 10 and 20 years for withdrawalYears >= 20", () => {
    const result = computeWithdrawalMilestones(30, 20, projections);
    expect(result).toEqual([
      { year: 10, annual: 1_000_000 },
      { year: 20, annual: 800_000 },
    ]);
  });

  test("returns milestone at midpoint for 10 <= withdrawalYears < 20", () => {
    const result = computeWithdrawalMilestones(10, 20, projections);
    expect(result).toEqual([{ year: 5, annual: 1_100_000 }]);
  });

  test("returns undefined for withdrawalYears < 10", () => {
    expect(computeWithdrawalMilestones(5, 20, projections)).toBeUndefined();
  });

  test("filters out milestones when projection year is missing", () => {
    // projections only has year 20 and 30, missing year 40
    const sparse: YearlyProjection[] = [mkProj(20, 0), mkProj(30, 1_000_000)];
    const result = computeWithdrawalMilestones(30, 20, sparse);
    // Should try year 30 (found) and year 40 (not found), only return the found one
    expect(result).toEqual([{ year: 10, annual: 1_000_000 }]);
  });
});

describe("computeTotalYears", () => {
  test("returns contributionYears when no withdrawal", () => {
    expect(computeTotalYears(30, 30, 0)).toBe(30);
  });

  test("returns withdrawal end when larger", () => {
    expect(computeTotalYears(20, 20, 25)).toBe(45);
  });

  test("returns contributionYears when larger than withdrawal end", () => {
    expect(computeTotalYears(50, 10, 10)).toBe(50);
  });

  test("handles idle period", () => {
    expect(computeTotalYears(20, 30, 25)).toBe(55);
  });
});

describe("computeSecurityScore", () => {
  test("returns 100 for zero depletion", () => {
    expect(computeSecurityScore(0)).toBe(100);
  });

  test("returns 0 for 100% depletion", () => {
    expect(computeSecurityScore(1)).toBe(0);
  });

  test("returns 80 for 20% depletion (no other factors)", () => {
    expect(computeSecurityScore(0.2)).toBe(80);
  });

  test("clamps to 0-100 range", () => {
    expect(computeSecurityScore(-0.1)).toBe(100);
    expect(computeSecurityScore(1.5)).toBe(0);
  });

  test("penalizes for high failure probability", () => {
    // base 80 - 0.5*20 = 70
    expect(computeSecurityScore(0.2, 0.5)).toBe(70);
  });

  test("caps at 10 when median is zero", () => {
    // base 17 but median is zero → capped at 10
    expect(computeSecurityScore(0.83, 0.25, true)).toBeLessThanOrEqual(10);
  });

  test("high depletion + high failure + median zero → near 0", () => {
    expect(computeSecurityScore(0.83, 0.25, true)).toBeLessThanOrEqual(10);
    // the original case: 82.76% depletion, 24.54% failure, p50=0
    const score = computeSecurityScore(0.8276, 0.2454, true);
    expect(score).toBeLessThanOrEqual(10);
  });
});

describe("getSecurityLabel", () => {
  test("returns 非常に安心 for score >= 95", () => {
    expect(getSecurityLabel(95)).toEqual({ label: "非常に安心", level: "safe" });
    expect(getSecurityLabel(100)).toEqual({ label: "非常に安心", level: "safe" });
  });

  test("returns 安心 for score >= 80", () => {
    expect(getSecurityLabel(80)).toEqual({ label: "安心", level: "safe" });
    expect(getSecurityLabel(94)).toEqual({ label: "安心", level: "safe" });
  });

  test("returns やや注意 for score >= 60", () => {
    expect(getSecurityLabel(60)).toEqual({ label: "やや注意", level: "caution" });
    expect(getSecurityLabel(79)).toEqual({ label: "やや注意", level: "caution" });
  });

  test("returns 注意 for score >= 40", () => {
    expect(getSecurityLabel(40)).toEqual({ label: "注意", level: "warning" });
    expect(getSecurityLabel(59)).toEqual({ label: "注意", level: "warning" });
  });

  test("returns 要見直し for score < 40", () => {
    expect(getSecurityLabel(39)).toEqual({ label: "要見直し", level: "danger" });
    expect(getSecurityLabel(0)).toEqual({ label: "要見直し", level: "danger" });
  });
});
