import { describe, it, expect } from "vitest";
import type { AnalyticsMetrics } from "./analytics";
import { calculateHealthScore } from "./analytics";

type FullMetrics = Omit<AnalyticsMetrics, "healthScore">;

function createMockMetrics(
  overrides: {
    savings?: Partial<FullMetrics["savings"]>;
    investment?: Partial<FullMetrics["investment"]>;
    spending?: Partial<FullMetrics["spending"]>;
    growth?: Partial<FullMetrics["growth"]>;
    balance?: Partial<FullMetrics["balance"]>;
    liability?: Partial<FullMetrics["liability"]>;
  } = {},
): FullMetrics {
  return {
    savings: {
      totalAssets: 5000000,
      liquidAssets: 2000000,
      monthlyExpenseAvg: 200000,
      emergencyFundMonths: 10,
      ...overrides.savings,
    },
    investment: {
      holdings: [],
      totalInvestment: 3000000,
      totalUnrealizedGain: 500000,
      totalUnrealizedGainPct: 16.7,
      diversificationScore: 70,
      ...overrides.investment,
    },
    spending: {
      monthlyAverage: 200000,
      byCategory: {},
      topCategories: [],
      anomalies: [],
      ...overrides.spending,
    },
    growth: {
      monthlyGrowthRate: 0.01,
      projectedAnnualRate: 0.127,
      projections: [],
      ...overrides.growth,
    },
    balance: {
      monthlyIncome: 400000,
      monthlyExpense: 200000,
      savingsRate: 50,
      trend: [],
      ...overrides.balance,
    },
    liability: {
      totalLiabilities: 0,
      byCategory: [],
      debtToAssetRatio: 0,
      ...overrides.liability,
    },
  };
}

describe("calculateHealthScore", () => {
  it("should return perfect score for ideal metrics", () => {
    const metrics = createMockMetrics({
      savings: { emergencyFundMonths: 12 },
      balance: { savingsRate: 40 },
      investment: { diversificationScore: 100 },
      growth: { monthlyGrowthRate: 0.03 },
      spending: { anomalies: [] },
    });

    const result = calculateHealthScore(metrics);

    expect(result.totalScore).toBe(100);
    expect(result.categories).toHaveLength(5);
  });

  it("should return zero score for worst metrics", () => {
    const metrics = createMockMetrics({
      savings: { emergencyFundMonths: 0 },
      balance: { savingsRate: -10 },
      investment: { diversificationScore: 0 },
      growth: { monthlyGrowthRate: -0.05 },
      spending: {
        anomalies: [
          { category: "a", amount: 100000, deviation: 3 },
          { category: "b", amount: 80000, deviation: 2.5 },
          { category: "c", amount: 60000, deviation: 2 },
        ],
      },
    });

    const result = calculateHealthScore(metrics);

    expect(result.totalScore).toBe(0);
  });

  it("should score emergency fund correctly at boundary values", () => {
    const result3 = calculateHealthScore(
      createMockMetrics({ savings: { emergencyFundMonths: 3 } }),
    );
    const result6 = calculateHealthScore(
      createMockMetrics({ savings: { emergencyFundMonths: 6 } }),
    );

    const get = (r: ReturnType<typeof calculateHealthScore>) =>
      r.categories.find((c) => c.name === "緊急予備資金")!;

    expect(get(result3).score).toBe(15);
    expect(get(result3).maxScore).toBe(25);
    expect(get(result6).score).toBe(25);
  });

  it("should score savings rate at defined thresholds", () => {
    const at10 = calculateHealthScore(createMockMetrics({ balance: { savingsRate: 10 } }));
    const at20 = calculateHealthScore(createMockMetrics({ balance: { savingsRate: 20 } }));
    const at30 = calculateHealthScore(createMockMetrics({ balance: { savingsRate: 30 } }));

    const get = (r: ReturnType<typeof calculateHealthScore>) =>
      r.categories.find((c) => c.name === "貯蓄率")!.score;

    expect(get(at10)).toBe(8);
    expect(get(at20)).toBe(17);
    expect(get(at30)).toBe(25);
  });

  it("should scale diversification score from 0-100 to 0-20", () => {
    const at0 = calculateHealthScore(
      createMockMetrics({ investment: { diversificationScore: 0 } }),
    );
    const at50 = calculateHealthScore(
      createMockMetrics({ investment: { diversificationScore: 50 } }),
    );
    const at100 = calculateHealthScore(
      createMockMetrics({ investment: { diversificationScore: 100 } }),
    );

    const get = (r: ReturnType<typeof calculateHealthScore>) =>
      r.categories.find((c) => c.name === "投資分散度")!.score;

    expect(get(at0)).toBe(0);
    expect(get(at50)).toBe(10);
    expect(get(at100)).toBe(20);
  });

  it("should score spending stability based on anomaly count", () => {
    const anomaly0 = calculateHealthScore(createMockMetrics({ spending: { anomalies: [] } }));
    const anomaly1 = calculateHealthScore(
      createMockMetrics({
        spending: { anomalies: [{ category: "a", amount: 100000, deviation: 3 }] },
      }),
    );
    const anomaly2 = calculateHealthScore(
      createMockMetrics({
        spending: {
          anomalies: [
            { category: "a", amount: 100000, deviation: 3 },
            { category: "b", amount: 80000, deviation: 2.5 },
          ],
        },
      }),
    );

    const get = (r: ReturnType<typeof calculateHealthScore>) =>
      r.categories.find((c) => c.name === "支出安定性")!.score;

    expect(get(anomaly0)).toBe(15);
    expect(get(anomaly1)).toBe(10);
    expect(get(anomaly2)).toBe(5);
  });

  it("should have 5 categories that sum to totalScore", () => {
    const result = calculateHealthScore(createMockMetrics());

    expect(result.categories).toHaveLength(5);
    const sum = result.categories.reduce((s, c) => s + c.score, 0);
    expect(sum).toBe(result.totalScore);
  });

  it("should have max scores summing to 100", () => {
    const result = calculateHealthScore(createMockMetrics());

    const maxSum = result.categories.reduce((s, c) => s + c.maxScore, 0);
    expect(maxSum).toBe(100);
  });

  it("should handle negative growth rate", () => {
    const negGrowth = calculateHealthScore(
      createMockMetrics({ growth: { monthlyGrowthRate: -0.01 } }),
    );
    const zeroGrowth = calculateHealthScore(
      createMockMetrics({ growth: { monthlyGrowthRate: 0 } }),
    );

    const getGrowth = (r: ReturnType<typeof calculateHealthScore>) =>
      r.categories.find((c) => c.name === "資産成長")!.score;

    expect(getGrowth(negGrowth)).toBeLessThan(getGrowth(zeroGrowth));
    expect(getGrowth(zeroGrowth)).toBe(Math.round(15 / 2));
  });
});
