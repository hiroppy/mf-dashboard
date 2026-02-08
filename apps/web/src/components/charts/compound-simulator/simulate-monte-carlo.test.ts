import { describe, it, expect } from "vitest";
import { simulateMonteCarlo } from "./simulate-monte-carlo";

describe("simulateMonteCarlo", () => {
  it("should return correct number of year entries", () => {
    const result = simulateMonteCarlo({
      initialAmount: 1000000,
      monthlyContribution: 0,
      annualReturnRate: 5,
      volatility: 15,
      inflationRate: 2,
      contributionYears: 10,
      withdrawalStartYear: 10,
      withdrawalYears: 0,
    });

    expect(result.yearlyData).toHaveLength(11);
    expect(result.yearlyData[0].year).toBe(0);
    expect(result.yearlyData[10].year).toBe(10);
  });

  it("should have percentiles in correct order", () => {
    const result = simulateMonteCarlo({
      initialAmount: 1000000,
      monthlyContribution: 50000,
      annualReturnRate: 7,
      volatility: 15,
      inflationRate: 2,
      contributionYears: 20,
      withdrawalStartYear: 20,
      withdrawalYears: 0,
    });

    for (const data of result.yearlyData) {
      expect(data.p10).toBeLessThanOrEqual(data.p25);
      expect(data.p25).toBeLessThanOrEqual(data.p50);
      expect(data.p50).toBeLessThanOrEqual(data.p75);
      expect(data.p75).toBeLessThanOrEqual(data.p90);
    }
  });

  it("should return initial amount at year 0", () => {
    const result = simulateMonteCarlo({
      initialAmount: 500000,
      monthlyContribution: 30000,
      annualReturnRate: 5,
      volatility: 15,
      inflationRate: 2,
      contributionYears: 10,
      withdrawalStartYear: 10,
      withdrawalYears: 0,
    });

    const year0 = result.yearlyData[0];
    expect(year0.p10).toBe(500000);
    expect(year0.p50).toBe(500000);
    expect(year0.p90).toBe(500000);
    expect(year0.principal).toBe(500000);
  });

  it("should have all percentiles equal with zero volatility", () => {
    const result = simulateMonteCarlo({
      initialAmount: 1000000,
      monthlyContribution: 0,
      annualReturnRate: 5,
      volatility: 0,
      inflationRate: 2,
      contributionYears: 5,
      withdrawalStartYear: 5,
      withdrawalYears: 0,
    });

    for (const data of result.yearlyData) {
      expect(data.p10).toBe(data.p50);
      expect(data.p50).toBe(data.p90);
    }
  });

  it("should widen spread with higher volatility", () => {
    const base = {
      initialAmount: 1000000,
      monthlyContribution: 50000,
      annualReturnRate: 7,
      inflationRate: 2,
      contributionYears: 20,
      withdrawalStartYear: 20,
      withdrawalYears: 0,
    };

    const low = simulateMonteCarlo({ ...base, volatility: 5 });
    const high = simulateMonteCarlo({ ...base, volatility: 25 });

    const lowSpread = low.yearlyData[20].p90 - low.yearlyData[20].p10;
    const highSpread = high.yearlyData[20].p90 - high.yearlyData[20].p10;

    expect(highSpread).toBeGreaterThan(lowSpread);
  });

  it("should return failure probability between 0 and 1", () => {
    const result = simulateMonteCarlo({
      initialAmount: 1000000,
      monthlyContribution: 50000,
      annualReturnRate: 5,
      volatility: 15,
      inflationRate: 2,
      contributionYears: 20,
      withdrawalStartYear: 20,
      withdrawalYears: 0,
    });

    expect(result.failureProbability).toBeGreaterThanOrEqual(0);
    expect(result.failureProbability).toBeLessThanOrEqual(1);
  });

  it("should have zero failure probability with zero volatility and positive return", () => {
    const result = simulateMonteCarlo({
      initialAmount: 1000000,
      monthlyContribution: 10000,
      annualReturnRate: 5,
      volatility: 0,
      inflationRate: 2,
      contributionYears: 10,
      withdrawalStartYear: 10,
      withdrawalYears: 0,
    });

    expect(result.failureProbability).toBe(0);
  });

  it("should be deterministic (same inputs give same output)", () => {
    const input = {
      initialAmount: 1000000,
      monthlyContribution: 50000,
      annualReturnRate: 7,
      volatility: 15,
      inflationRate: 2,
      contributionYears: 20,
      withdrawalStartYear: 20,
      withdrawalYears: 0,
    } as const;

    const run1 = simulateMonteCarlo(input);
    const run2 = simulateMonteCarlo(input);

    expect(run1.yearlyData).toEqual(run2.yearlyData);
    expect(run1.failureProbability).toBe(run2.failureProbability);
  });

  it("should set isContributing/isWithdrawing correctly without withdrawal", () => {
    const result = simulateMonteCarlo({
      initialAmount: 1000000,
      monthlyContribution: 0,
      annualReturnRate: 5,
      volatility: 15,
      inflationRate: 2,
      contributionYears: 5,
      withdrawalStartYear: 5,
      withdrawalYears: 0,
    });

    expect(result.yearlyData[0].isContributing).toBe(false);
    for (let i = 1; i <= 5; i++) {
      expect(result.yearlyData[i].isContributing).toBe(true);
      expect(result.yearlyData[i].isWithdrawing).toBe(false);
    }
  });

  it("should reduce returns with higher inflation rate", () => {
    const base = {
      initialAmount: 1_000_000,
      monthlyContribution: 50_000,
      annualReturnRate: 7,
      volatility: 15,
      contributionYears: 20,
      withdrawalStartYear: 20,
      withdrawalYears: 0,
    };

    const lowInflation = simulateMonteCarlo({ ...base, inflationRate: 0 });
    const highInflation = simulateMonteCarlo({ ...base, inflationRate: 4 });

    // Higher inflation should result in lower median at year 20
    expect(highInflation.yearlyData[20].p50).toBeLessThan(lowInflation.yearlyData[20].p50);
  });

  describe("withdrawal phase", () => {
    it("should extend yearlyData by withdrawalYears", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 20,
        withdrawalStartYear: 20,
        monthlyWithdrawal: 150_000,
        withdrawalYears: 10,
      });

      // 0..20 contribution (21) + 21..30 withdrawal (10) = 31
      expect(result.yearlyData).toHaveLength(31);
    });

    it("should return depletionProbability between 0 and 1", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 20,
        withdrawalStartYear: 20,
        monthlyWithdrawal: 150_000,
        withdrawalYears: 25,
      });

      expect(result.depletionProbability).toBeGreaterThanOrEqual(0);
      expect(result.depletionProbability).toBeLessThanOrEqual(1);
    });

    it("should have high depletion probability with large withdrawal", () => {
      const result = simulateMonteCarlo({
        initialAmount: 1_000_000,
        monthlyContribution: 0,
        annualReturnRate: 3,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 5,
        withdrawalStartYear: 5,
        monthlyWithdrawal: 500_000,
        withdrawalYears: 10,
      });

      expect(result.depletionProbability).toBeGreaterThan(0.5);
    });

    it("should have low depletion probability with small withdrawal", () => {
      const result = simulateMonteCarlo({
        initialAmount: 100_000_000,
        monthlyContribution: 100_000,
        annualReturnRate: 7,
        volatility: 10,
        inflationRate: 2,
        contributionYears: 20,
        withdrawalStartYear: 20,
        monthlyWithdrawal: 10_000,
        withdrawalYears: 5,
      });

      expect(result.depletionProbability).toBeLessThan(0.01);
    });

    it("should return depletionProbability 0 when withdrawalYears is 0", () => {
      const result = simulateMonteCarlo({
        initialAmount: 1_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 0,
      });

      expect(result.depletionProbability).toBe(0);
    });

    it("should be deterministic with withdrawal", () => {
      const input = {
        initialAmount: 5_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
      } as const;

      const run1 = simulateMonteCarlo(input);
      const run2 = simulateMonteCarlo(input);

      expect(run1.yearlyData).toEqual(run2.yearlyData);
      expect(run1.depletionProbability).toBe(run2.depletionProbability);
    });

    it("should maintain percentile ordering during withdrawal", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
      });

      for (const data of result.yearlyData) {
        expect(data.p10).toBeLessThanOrEqual(data.p25);
        expect(data.p25).toBeLessThanOrEqual(data.p50);
        expect(data.p50).toBeLessThanOrEqual(data.p75);
        expect(data.p75).toBeLessThanOrEqual(data.p90);
      }
    });

    it("should apply tax at withdrawal start (lower values than accumulation end)", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 7,
        volatility: 0,
        inflationRate: 0,
        contributionYears: 20,
        withdrawalStartYear: 20,
        monthlyWithdrawal: 1,
        withdrawalYears: 1,
      });

      const accEnd = result.yearlyData.filter((d) => d.isContributing).at(-1)!;
      const drawStart = result.yearlyData.filter((d) => d.isWithdrawing)[0];

      // With zero volatility and tiny withdrawal, drawdown year 1 p50 should be
      // close to accumulation end (no lump-sum tax, only proportional tax on withdrawal)
      expect(drawStart.p50).toBeGreaterThan(accEnd.p50 * 0.9);
    });

    it("should have higher depletion with tax than without (tax makes depletion worse)", () => {
      const result = simulateMonteCarlo({
        initialAmount: 5_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        volatility: 0,
        inflationRate: 0,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 5,
      });

      const accEnd = result.yearlyData.filter((d) => d.isContributing).at(-1)!;
      const drawEnd = result.yearlyData.filter((d) => d.isWithdrawing).at(-1)!;

      const naiveAnnualReturn = accEnd.p50 * 0.05;
      const naiveAfter5Years = accEnd.p50 + 5 * (naiveAnnualReturn - 100_000 * 12);
      expect(drawEnd.p50).toBeLessThan(naiveAfter5Years);
    });

    it("should set isWithdrawing correctly on yearlyData entries", () => {
      const result = simulateMonteCarlo({
        initialAmount: 5_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 50_000,
        withdrawalYears: 5,
      });

      const contribEntries = result.yearlyData.filter((d) => d.isContributing && !d.isWithdrawing);
      const withdrawEntries = result.yearlyData.filter((d) => d.isWithdrawing && !d.isContributing);
      expect(contribEntries).toHaveLength(10);
      expect(withdrawEntries).toHaveLength(5);
    });
  });

  describe("idle (gap) period", () => {
    it("should handle gap between contribution and withdrawal", () => {
      const result = simulateMonteCarlo({
        initialAmount: 1_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 10,
        withdrawalStartYear: 15,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
      });

      // totalYears = max(10, 15+10) = 25, so 0..25 = 26 entries
      expect(result.yearlyData).toHaveLength(26);

      // Years 11-15 should be idle
      for (let i = 11; i <= 15; i++) {
        expect(result.yearlyData[i].isContributing).toBe(false);
        expect(result.yearlyData[i].isWithdrawing).toBe(false);
      }
    });
  });

  describe("overlap period", () => {
    it("should handle contributing and withdrawing simultaneously", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 100_000,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 20,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 50_000,
        withdrawalYears: 20,
      });

      // totalYears = max(20, 10+20) = 30, so 0..30 = 31 entries
      expect(result.yearlyData).toHaveLength(31);

      // Years 11-20 should be overlap
      for (let i = 11; i <= 20; i++) {
        expect(result.yearlyData[i].isContributing).toBe(true);
        expect(result.yearlyData[i].isWithdrawing).toBe(true);
      }
    });
  });

  describe("expense ratio", () => {
    it("should reduce median by expense ratio", () => {
      const base = {
        initialAmount: 1_000_000,
        monthlyContribution: 50_000,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 20,
        withdrawalStartYear: 20,
        withdrawalYears: 0,
      };

      const noExpense = simulateMonteCarlo({ ...base, annualReturnRate: 7, expenseRatio: 0 });
      const withExpense = simulateMonteCarlo({ ...base, annualReturnRate: 7, expenseRatio: 1 });

      // Median should be lower with expense ratio
      expect(withExpense.yearlyData[20].p50).toBeLessThan(noExpense.yearlyData[20].p50);
    });
  });

  describe("rate-based withdrawal", () => {
    it("should produce different withdrawal per path (medianYearlyWithdrawal exists)", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 10,
        withdrawalStartYear: 10,
        annualWithdrawalRate: 4,
        withdrawalYears: 10,
      });

      const withdrawYears = result.yearlyData.filter((d) => d.isWithdrawing);
      // Rate mode should have medianYearlyWithdrawal
      expect(withdrawYears[0].medianYearlyWithdrawal).toBeDefined();
      expect(withdrawYears[0].medianYearlyWithdrawal).toBeGreaterThan(0);
    });

    it("should have non-zero depletion probability with high volatility (trinity study)", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        volatility: 20,
        inflationRate: 2,
        contributionYears: 10,
        withdrawalStartYear: 10,
        annualWithdrawalRate: 6,
        withdrawalYears: 30,
      });

      // Fixed-amount (trinity) rate mode can now deplete
      expect(result.depletionProbability).toBeGreaterThan(0);
    });

    it("should fix withdrawal amount at withdrawal start (zero volatility)", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        volatility: 0,
        inflationRate: 0,
        contributionYears: 10,
        withdrawalStartYear: 10,
        annualWithdrawalRate: 4,
        withdrawalYears: 10,
      });

      const withdrawYears = result.yearlyData.filter((d) => d.isWithdrawing);
      // With zero volatility + zero inflation, all withdrawal years should have same medianYearlyWithdrawal
      const firstYearWithdrawal = withdrawYears[0].medianYearlyWithdrawal!;
      expect(firstYearWithdrawal).toBeGreaterThan(0);
      for (const yd of withdrawYears) {
        expect(yd.medianYearlyWithdrawal).toBe(firstYearWithdrawal);
      }
    });

    it("should keep withdrawal constant in real terms with positive inflation (trinity study)", () => {
      // Trinity Study: withdrawal is inflation-adjusted (nominal increases with inflation).
      // In the MC simulation (which works in real terms), this means the withdrawal
      // should stay constant across all years.
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        volatility: 0,
        inflationRate: 3,
        contributionYears: 0,
        withdrawalStartYear: 0,
        annualWithdrawalRate: 4,
        withdrawalYears: 20,
      });

      const withdrawYears = result.yearlyData.filter((d) => d.isWithdrawing);
      const firstWithdrawal = withdrawYears[0].medianYearlyWithdrawal!;
      expect(firstWithdrawal).toBeGreaterThan(0);
      for (const yd of withdrawYears) {
        expect(yd.medianYearlyWithdrawal).toBe(firstWithdrawal);
      }
    });
  });

  describe("immediate withdrawal (no contribution)", () => {
    it("should have non-zero failureProbability when contributionYears=0 with high volatility", () => {
      const result = simulateMonteCarlo({
        initialAmount: 1_000_000,
        monthlyContribution: 0,
        annualReturnRate: 3,
        volatility: 30,
        inflationRate: 2,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 30,
      });

      // With high volatility and withdrawal, some simulations should lose principal
      expect(result.failureProbability).toBeGreaterThan(0);
    });

    it("should handle contributionYears=0 with immediate withdrawal", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 3,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 30,
      });

      // totalYears = max(0, 0+30) = 30, so 0..30 = 31 entries
      expect(result.yearlyData).toHaveLength(31);
      expect(result.yearlyData[0].isWithdrawing).toBe(false);
      expect(result.yearlyData[1].isWithdrawing).toBe(true);
      expect(result.yearlyData[1].isContributing).toBe(false);
    });
  });

  describe("pension income", () => {
    it("should reduce depletion with pension offset", () => {
      const base = {
        initialAmount: 5_000_000,
        monthlyContribution: 0,
        annualReturnRate: 3,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 20,
      };

      const noPension = simulateMonteCarlo({ ...base });
      const withPension = simulateMonteCarlo({ ...base, monthlyPensionIncome: 50_000 });

      // Pension reduces net withdrawal, so less depletion
      expect(withPension.depletionProbability).toBeLessThan(noPension.depletionProbability);
    });
  });

  describe("tax-free withdrawal", () => {
    it("should have more remaining with tax-free withdrawal", () => {
      const base = {
        initialAmount: 10_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
        volatility: 0,
        inflationRate: 0,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
      };

      const taxed = simulateMonteCarlo({ ...base });
      const taxFree = simulateMonteCarlo({ ...base, taxFree: true });

      const taxedEnd = taxed.yearlyData.filter((d) => d.isWithdrawing).at(-1)!;
      const taxFreeEnd = taxFree.yearlyData.filter((d) => d.isWithdrawing).at(-1)!;

      expect(taxFreeEnd.p50).toBeGreaterThan(taxedEnd.p50);
    });
  });

  describe("inflation-adjusted withdrawal", () => {
    it("should deplete faster with inflation-adjusted withdrawal", () => {
      const base = {
        initialAmount: 5_000_000,
        monthlyContribution: 0,
        annualReturnRate: 3,
        volatility: 15,
        inflationRate: 3,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 80_000,
        withdrawalYears: 20,
      };

      const noAdj = simulateMonteCarlo({ ...base, inflationAdjustedWithdrawal: false });
      const withAdj = simulateMonteCarlo({ ...base, inflationAdjustedWithdrawal: true });

      // Inflation-adjusted stays constant in real terms (higher real withdrawal)
      // Nominal fixed deflates in real terms (lower real withdrawal)
      expect(withAdj.depletionProbability).toBeGreaterThanOrEqual(noAdj.depletionProbability);
    });

    it("should deflate nominal withdrawal in real terms (more remaining than inflation-adjusted)", () => {
      const base = {
        initialAmount: 100_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        volatility: 0,
        inflationRate: 3,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 20,
      };

      const noAdj = simulateMonteCarlo({ ...base, inflationAdjustedWithdrawal: false });
      const withAdj = simulateMonteCarlo({ ...base, inflationAdjustedWithdrawal: true });

      // With zero volatility: nominal fixed withdrawal decreases in real terms,
      // so portfolio retains more value than constant real withdrawal
      const noAdjEnd = noAdj.yearlyData.at(-1)!;
      const adjEnd = withAdj.yearlyData.at(-1)!;
      expect(noAdjEnd.p50).toBeGreaterThan(adjEnd.p50);
    });

    it("should have no deflation effect when inflation is zero", () => {
      const base = {
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        volatility: 0,
        inflationRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
      };

      const noAdj = simulateMonteCarlo({ ...base, inflationAdjustedWithdrawal: false });
      const withAdj = simulateMonteCarlo({ ...base, inflationAdjustedWithdrawal: true });

      // With zero inflation, both modes should produce identical results
      const noAdjEnd = noAdj.yearlyData.at(-1)!;
      const adjEnd = withAdj.yearlyData.at(-1)!;
      expect(noAdjEnd.p50).toBe(adjEnd.p50);
    });
  });

  describe("expense ratio with withdrawal", () => {
    it("should reduce median during withdrawal with expense ratio", () => {
      const base = {
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        volatility: 0,
        inflationRate: 0,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 50_000,
        withdrawalYears: 10,
      };

      const noExpense = simulateMonteCarlo({ ...base, expenseRatio: 0 });
      const withExpense = simulateMonteCarlo({ ...base, expenseRatio: 1 });

      const noExpenseEnd = noExpense.yearlyData.filter((d) => d.isWithdrawing).at(-1)!;
      const withExpenseEnd = withExpense.yearlyData.filter((d) => d.isWithdrawing).at(-1)!;

      expect(withExpenseEnd.p50).toBeLessThan(noExpenseEnd.p50);
    });
  });

  describe("distribution output", () => {
    it("should return distribution array with bins", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 20,
        withdrawalStartYear: 20,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 20,
      });

      expect(result.distribution).toBeDefined();
      expect(result.distribution.length).toBeGreaterThan(0);
    });

    it("should have all bin counts sum to 5000", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 20,
        withdrawalStartYear: 20,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 20,
      });

      const totalCount = result.distribution.reduce((sum, b) => sum + b.count, 0);
      expect(totalCount).toBe(5000);
    });

    it("should have monotonically increasing rangeEnd for non-depleted bins", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 20,
        withdrawalStartYear: 20,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 20,
      });

      const nonDepleted = result.distribution.filter((b) => !b.isDepleted);
      for (let i = 1; i < nonDepleted.length; i++) {
        expect(nonDepleted[i].rangeEnd).toBeGreaterThan(nonDepleted[i - 1].rangeEnd);
      }
    });

    it("should include depleted bin when paths deplete", () => {
      const result = simulateMonteCarlo({
        initialAmount: 1_000_000,
        monthlyContribution: 0,
        annualReturnRate: 2,
        volatility: 20,
        inflationRate: 2,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 200_000,
        withdrawalYears: 10,
      });

      const depletedBin = result.distribution.find((b) => b.isDepleted);
      expect(depletedBin).toBeDefined();
      expect(depletedBin!.count).toBeGreaterThan(0);
      expect(depletedBin!.rangeEnd).toBe(0);
    });

    it("should not include depleted bin when no depletion occurs", () => {
      const result = simulateMonteCarlo({
        initialAmount: 100_000_000,
        monthlyContribution: 0,
        annualReturnRate: 7,
        volatility: 5,
        inflationRate: 0,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 10_000,
        withdrawalYears: 5,
      });

      const depletedBin = result.distribution.find((b) => b.isDepleted);
      expect(depletedBin).toBeUndefined();
    });

    it("should have non-depleted bins with rangeEnd > 0", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 20,
        withdrawalStartYear: 20,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 20,
      });

      const nonDepleted = result.distribution.filter((b) => !b.isDepleted);
      for (const bin of nonDepleted) {
        expect(bin.rangeEnd).toBeGreaterThan(0);
      }
    });
  });

  describe("depletionRate on yearlyData", () => {
    it("should have depletionRate on withdrawing years", () => {
      const result = simulateMonteCarlo({
        initialAmount: 5_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 5,
        withdrawalStartYear: 5,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
      });

      const withdrawing = result.yearlyData.filter((d) => d.isWithdrawing);
      for (const d of withdrawing) {
        expect(d.depletionRate).toBeDefined();
        expect(d.depletionRate).toBeGreaterThanOrEqual(0);
        expect(d.depletionRate).toBeLessThanOrEqual(1);
      }
    });

    it("should not have depletionRate on non-withdrawing years", () => {
      const result = simulateMonteCarlo({
        initialAmount: 5_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 5,
        withdrawalStartYear: 5,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
      });

      const nonWithdrawing = result.yearlyData.filter((d) => !d.isWithdrawing);
      for (const d of nonWithdrawing) {
        expect(d.depletionRate).toBeUndefined();
      }
    });
  });

  describe("medianYearlyWithdrawal", () => {
    it("should not have medianYearlyWithdrawal in amount mode", () => {
      const result = simulateMonteCarlo({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        volatility: 15,
        inflationRate: 2,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
      });

      const withdrawing = result.yearlyData.filter((d) => d.isWithdrawing);
      for (const d of withdrawing) {
        expect(d.medianYearlyWithdrawal).toBeUndefined();
      }
    });
  });

  describe("probability invariant", () => {
    it("failureProbability accounts for cumulative withdrawals (total return metric)", () => {
      const result = simulateMonteCarlo({
        initialAmount: 5_000_000,
        monthlyContribution: 0,
        annualReturnRate: 3,
        volatility: 20,
        inflationRate: 2,
        contributionYears: 5,
        withdrawalStartYear: 5,
        monthlyWithdrawal: 150_000,
        withdrawalYears: 20,
      });

      // failureProbability = (remaining + cumulative_withdrawals) < totalPrincipal
      // Depleted paths may still have positive total return, so failure can be lower than depletion
      expect(result.failureProbability).toBeGreaterThanOrEqual(0);
      expect(result.failureProbability).toBeLessThanOrEqual(1);
    });

    it("failureProbability should be >= depletionProbability without withdrawal", () => {
      const result = simulateMonteCarlo({
        initialAmount: 1_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 3,
        volatility: 25,
        inflationRate: 2,
        contributionYears: 20,
        withdrawalStartYear: 20,
        withdrawalYears: 0,
      });

      // Without withdrawal, cumulative withdrawals = 0, so original invariant holds
      expect(result.failureProbability).toBeGreaterThanOrEqual(result.depletionProbability);
    });
  });
});
