import { describe, it, expect } from "vitest";
import { calculateCompound } from "./calculate-compound";

describe("calculateCompound", () => {
  it("should return correct number of projections", () => {
    const result = calculateCompound({
      initialAmount: 1000000,
      monthlyContribution: 0,
      annualReturnRate: 5,
      contributionYears: 10,
      withdrawalStartYear: 10,
      withdrawalYears: 0,
    });

    expect(result).toHaveLength(11);
    expect(result[0].year).toBe(0);
    expect(result[10].year).toBe(10);
  });

  it("should calculate compound interest correctly without contributions", () => {
    const result = calculateCompound({
      initialAmount: 1000000,
      monthlyContribution: 0,
      annualReturnRate: 10,
      contributionYears: 1,
      withdrawalStartYear: 1,
      withdrawalYears: 0,
    });

    const finalYear = result[1];
    expect(finalYear.principal).toBe(1000000);
    expect(finalYear.total).toBeGreaterThan(1000000);
  });

  it("should calculate with monthly contributions", () => {
    const result = calculateCompound({
      initialAmount: 0,
      monthlyContribution: 10000,
      annualReturnRate: 0,
      contributionYears: 1,
      withdrawalStartYear: 1,
      withdrawalYears: 0,
    });

    const finalYear = result[1];
    expect(finalYear.principal).toBe(120000);
    expect(finalYear.total).toBe(120000);
    expect(finalYear.interest).toBe(0);
    expect(finalYear.tax).toBe(0);
  });

  it("should handle zero return rate", () => {
    const result = calculateCompound({
      initialAmount: 1000000,
      monthlyContribution: 50000,
      annualReturnRate: 0,
      contributionYears: 5,
      withdrawalStartYear: 5,
      withdrawalYears: 0,
    });

    const finalYear = result[5];
    expect(finalYear.principal).toBe(1000000 + 50000 * 12 * 5);
    expect(finalYear.interest).toBe(0);
    expect(finalYear.tax).toBe(0);
    expect(finalYear.total).toBe(finalYear.principal);
  });

  it("should show compounding effect over time", () => {
    const result = calculateCompound({
      initialAmount: 1000000,
      monthlyContribution: 10000,
      annualReturnRate: 5,
      contributionYears: 20,
      withdrawalStartYear: 20,
      withdrawalYears: 0,
    });

    const year10 = result[10];
    const year20 = result[20];

    expect(year20.interest + year20.tax).toBeGreaterThan((year10.interest + year10.tax) * 2);
    expect(year20.total).toBeGreaterThan(year10.total);
  });

  it("should return initial amount at year 0", () => {
    const result = calculateCompound({
      initialAmount: 500000,
      monthlyContribution: 30000,
      annualReturnRate: 7,
      contributionYears: 15,
      withdrawalStartYear: 15,
      withdrawalYears: 0,
    });

    const year0 = result[0];
    expect(year0.year).toBe(0);
    expect(year0.principal).toBe(500000);
    expect(year0.interest).toBe(0);
    expect(year0.tax).toBe(0);
    expect(year0.total).toBe(500000);
  });

  it("should apply 20.315% tax on interest", () => {
    const result = calculateCompound({
      initialAmount: 1000000,
      monthlyContribution: 0,
      annualReturnRate: 10,
      contributionYears: 1,
      withdrawalStartYear: 1,
      withdrawalYears: 0,
    });

    const finalYear = result[1];
    expect(finalYear.tax).toBeGreaterThan(0);
    expect(finalYear.total).toBe(finalYear.principal + finalYear.interest);
  });

  it("should set isContributing/isWithdrawing flags correctly without withdrawal", () => {
    const result = calculateCompound({
      initialAmount: 1000000,
      monthlyContribution: 0,
      annualReturnRate: 5,
      contributionYears: 5,
      withdrawalStartYear: 5,
      withdrawalYears: 0,
    });

    expect(result[0].isContributing).toBe(false);
    expect(result[0].isWithdrawing).toBe(false);
    for (let i = 1; i <= 5; i++) {
      expect(result[i].isContributing).toBe(true);
      expect(result[i].isWithdrawing).toBe(false);
    }
  });

  describe("withdrawal phase", () => {
    it("should extend projections by withdrawalYears", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
        contributionYears: 20,
        withdrawalStartYear: 20,
        monthlyWithdrawal: 150_000,
        withdrawalYears: 10,
      });

      // 0..20 contribution (21) + 21..30 withdrawal (10) = 31
      expect(result).toHaveLength(31);
    });

    it("should decrease total during withdrawal", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 5,
        withdrawalStartYear: 5,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 5,
      });

      const accEnd = result[5];
      const drawEnd = result[10];
      expect(drawEnd.total).toBeLessThan(accEnd.total);
    });

    it("should clamp total to zero", () => {
      const result = calculateCompound({
        initialAmount: 1_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 1,
        withdrawalStartYear: 1,
        monthlyWithdrawal: 500_000,
        withdrawalYears: 5,
      });

      const last = result[result.length - 1];
      expect(last.total).toBe(0);
    });

    it("should not add withdrawal entries when withdrawalYears is 0", () => {
      const result = calculateCompound({
        initialAmount: 1_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 0,
      });

      expect(result).toHaveLength(11);
    });

    it("should set isContributing/isWithdrawing flags correctly", () => {
      const result = calculateCompound({
        initialAmount: 5_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 5,
      });

      const contribEntries = result.filter((p) => p.isContributing && !p.isWithdrawing);
      const withdrawEntries = result.filter((p) => p.isWithdrawing && !p.isContributing);
      expect(contribEntries).toHaveLength(10);
      expect(withdrawEntries).toHaveLength(5);
    });

    it("should decrease principal proportionally during withdrawal", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 100_000,
        annualReturnRate: 5,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 50_000,
        withdrawalYears: 5,
      });

      const accEnd = result.find((p) => p.year === 10)!;
      const withdrawalEntries = result.filter((p) => p.isWithdrawing);
      // Principal decreases proportionally during withdrawal
      for (const d of withdrawalEntries) {
        expect(d.principal).toBeLessThanOrEqual(accEnd.principal);
      }
      // Last withdrawal entry should have less principal than accumulation end
      const lastWithdrawal = withdrawalEntries.at(-1)!;
      expect(lastWithdrawal.principal).toBeLessThan(accEnd.principal);
    });

    it("should apply tax during withdrawal when there are gains", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 50_000,
        withdrawalYears: 5,
      });

      const withdrawalEntries = result.filter((p) => p.isWithdrawing);
      const withTax = withdrawalEntries.filter((d) => d.tax > 0);
      expect(withTax.length).toBeGreaterThan(0);
    });

    it("should reduce total faster with withdrawal tax on gains", () => {
      // With positive return, gains exist so tax is deducted on withdrawal
      const taxed = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
      });

      const taxFree = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
        taxFree: true,
      });

      // Tax-free should have more remaining than taxed
      expect(taxFree[20].total).toBeGreaterThan(taxed[20].total);
    });

    it("should not apply withdrawal tax when there are no gains", () => {
      // Zero return rate means no gains, so withdrawal tax should be zero
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 5,
        withdrawalStartYear: 5,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 5,
      });

      // With 0% return and 100k/month withdrawal for 5 years = 6M withdrawn
      // Remaining = 10M - 6M = 4M
      expect(result[10].total).toBe(4_000_000);
    });

    it("should reduce principal proportionally during withdrawal", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 50_000,
        withdrawalYears: 5,
      });

      const accEnd = result.find((p) => p.year === 10)!;
      const drawEnd = result.find((p) => p.year === 15)!;
      // Principal should decrease during withdrawal (proportional reduction)
      expect(drawEnd.principal).toBeLessThan(accEnd.principal);
    });
  });

  describe("idle (gap) period", () => {
    it("should handle gap between contribution and withdrawal", () => {
      const result = calculateCompound({
        initialAmount: 1_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 5,
        contributionYears: 10,
        withdrawalStartYear: 15,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
      });

      // totalYears = max(10, 15+10) = 25, so 0..25 = 26 entries
      expect(result).toHaveLength(26);

      // Years 11-15 should be idle (not contributing, not withdrawing)
      for (let i = 11; i <= 15; i++) {
        const entry = result[i];
        expect(entry.isContributing).toBe(false);
        expect(entry.isWithdrawing).toBe(false);
      }

      // During idle period, total should still grow (compound interest)
      expect(result[15].total).toBeGreaterThan(result[10].total);
    });

    it("should produce same result as contribution with zero monthly amount", () => {
      // 据え置き10年 vs 積立0円×10年は等価であるべき
      const idle = calculateCompound({
        initialAmount: 5_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        contributionYears: 0,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
      });

      const contrib = calculateCompound({
        initialAmount: 5_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
      });

      // 切り崩し開始時点(year 10)の資産は同じ
      expect(idle[10].total).toBe(contrib[10].total);
      // 切り崩し終了時点(year 20)の資産も同じ
      expect(idle[20].total).toBe(contrib[20].total);
    });

    it("should grow principal only during contribution, not idle", () => {
      const result = calculateCompound({
        initialAmount: 1_000_000,
        monthlyContribution: 50_000,
        annualReturnRate: 0,
        contributionYears: 5,
        withdrawalStartYear: 10,
        withdrawalYears: 0,
      });

      const principalAtContribEnd = result[5].principal;
      // 1_000_000 + 50_000 * 12 * 5 = 4_000_000
      expect(principalAtContribEnd).toBe(4_000_000);

      // During idle period, principal should stay frozen
      for (let i = 6; i <= 10; i++) {
        expect(result[i].principal).toBe(principalAtContribEnd);
      }
    });
  });

  describe("overlap period", () => {
    it("should handle contributing and withdrawing simultaneously", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 100_000,
        annualReturnRate: 5,
        contributionYears: 20,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 50_000,
        withdrawalYears: 20,
      });

      // totalYears = max(20, 10+20) = 30, so 0..30 = 31 entries
      expect(result).toHaveLength(31);

      // Years 11-20 should be overlap (both contributing and withdrawing)
      for (let i = 11; i <= 20; i++) {
        const entry = result[i];
        expect(entry.isContributing).toBe(true);
        expect(entry.isWithdrawing).toBe(true);
      }
    });

    it("should net contribution and withdrawal during overlap with zero return", () => {
      // 月10万積立 - 月3万切り崩し = 実質月7万積立
      const result = calculateCompound({
        initialAmount: 0,
        monthlyContribution: 100_000,
        annualReturnRate: 0,
        contributionYears: 10,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 30_000,
        withdrawalYears: 10,
      });

      // Year 1: 積立 100_000*12 = 1_200_000, 切り崩し 30_000*12 = 360_000
      // net = 840_000
      expect(result[1].total).toBe(840_000);
      // Year 10: net = 840_000 * 10
      expect(result[10].total).toBe(8_400_000);
    });

    it("should grow more than withdrawal-only due to continued contributions", () => {
      const base = {
        initialAmount: 10_000_000,
        annualReturnRate: 5,
        monthlyWithdrawal: 50_000,
        withdrawalStartYear: 0,
        withdrawalYears: 20,
      };

      const withContrib = calculateCompound({
        ...base,
        monthlyContribution: 100_000,
        contributionYears: 20,
      });

      const withoutContrib = calculateCompound({
        ...base,
        monthlyContribution: 0,
        contributionYears: 0,
      });

      expect(withContrib[20].total).toBeGreaterThan(withoutContrib[20].total);
    });
  });

  describe("expense ratio", () => {
    it("should reduce returns by expense ratio", () => {
      const withExpense = calculateCompound({
        initialAmount: 1_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        expenseRatio: 1,
        contributionYears: 10,
        withdrawalStartYear: 10,
        withdrawalYears: 0,
      });

      const withLowerReturn = calculateCompound({
        initialAmount: 1_000_000,
        monthlyContribution: 0,
        annualReturnRate: 4,
        contributionYears: 10,
        withdrawalStartYear: 10,
        withdrawalYears: 0,
      });

      // 5% return with 1% expense ratio should equal 4% return
      expect(withExpense[10].total).toBe(withLowerReturn[10].total);
    });
  });

  describe("rate-based withdrawal", () => {
    it("should fix withdrawal amount at start (trinity study style)", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        annualWithdrawalRate: 4,
        withdrawalYears: 10,
      });

      const withdrawals = result.filter((p) => p.isWithdrawing);
      // With zero return and zero inflation, all years should have the same withdrawal
      const first = withdrawals[0].yearlyWithdrawal;
      expect(first).toBe(400000); // 10M * 4% = 400K/year
      for (const w of withdrawals) {
        expect(w.yearlyWithdrawal).toBe(first);
      }
    });

    it("should not deplete with rate-based withdrawal (low rate)", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        contributionYears: 0,
        withdrawalStartYear: 0,
        annualWithdrawalRate: 3,
        withdrawalYears: 50,
      });

      // With 5% return and 3% withdrawal rate, should never deplete
      expect(result[result.length - 1].total).toBeGreaterThan(0);
    });

    it("should apply pension offset with rate-based withdrawal", () => {
      const withPension = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        annualWithdrawalRate: 4,
        withdrawalYears: 10,
        monthlyPensionIncome: 10_000,
        pensionStartYear: 0,
      });

      const withoutPension = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        annualWithdrawalRate: 4,
        withdrawalYears: 10,
      });

      // With pension offset, more should remain
      expect(withPension[10].total).toBeGreaterThan(withoutPension[10].total);
    });

    it("should record yearlyWithdrawal for both modes", () => {
      const amountMode = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 5,
      });

      const rateMode = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        annualWithdrawalRate: 4,
        withdrawalYears: 5,
      });

      // Amount mode: yearly withdrawal should be 100_000 * 12 = 1_200_000
      expect(amountMode[1].yearlyWithdrawal).toBe(1_200_000);
      // Rate mode: first year ~4% of 10M = 400_000
      expect(rateMode[1].yearlyWithdrawal).toBeGreaterThan(300_000);
      expect(rateMode[1].yearlyWithdrawal).toBeLessThan(500_000);
    });

    it("should ignore inflationAdjustedWithdrawal in rate mode", () => {
      const withInflation = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        annualWithdrawalRate: 4,
        withdrawalYears: 10,
        inflationRate: 3,
        inflationAdjustedWithdrawal: true,
      });

      const withoutInflation = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        annualWithdrawalRate: 4,
        withdrawalYears: 10,
        inflationRate: 3,
        inflationAdjustedWithdrawal: false,
      });

      // Rate mode should produce same results regardless of inflationAdjustedWithdrawal
      expect(withInflation[10].total).toBe(withoutInflation[10].total);
    });
  });

  describe("immediate withdrawal (no contribution)", () => {
    it("should handle contributionYears=0 with immediate withdrawal", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 3,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 30,
      });

      // totalYears = max(0, 0+30) = 30, so 0..30 = 31 entries
      expect(result).toHaveLength(31);
      expect(result[0].isWithdrawing).toBe(false);
      expect(result[1].isWithdrawing).toBe(true);
      expect(result[1].isContributing).toBe(false);
    });

    it("should decrease total with zero return rate", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
      });

      // Year 1: 10_000_000 - 100_000 * 12 = 8_800_000
      expect(result[1].total).toBe(8_800_000);
      // Year 10: 10_000_000 - 100_000 * 12 * 10 = -2_000_000 → clamped to 0
      expect(result[10].total).toBe(0);
    });

    it("should last longer with positive return rate", () => {
      const withReturn = calculateCompound({
        initialAmount: 50_000_000,
        monthlyContribution: 0,
        annualReturnRate: 5,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 30,
      });

      const withoutReturn = calculateCompound({
        initialAmount: 50_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 30,
      });

      expect(withReturn[30].total).toBeGreaterThan(withoutReturn[30].total);
    });
  });

  describe("inflation-adjusted withdrawal (amount mode)", () => {
    it("should increase withdrawal amount over time with inflation", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
        inflationRate: 3,
        inflationAdjustedWithdrawal: true,
      });

      const withdrawals = result.filter((p) => p.isWithdrawing);
      // First year withdrawal should be slightly above 1.2M (inflated from month 1)
      expect(withdrawals[0].yearlyWithdrawal).toBeGreaterThan(1_200_000);
      // Later years should have even higher withdrawal
      expect(withdrawals[4].yearlyWithdrawal).toBeGreaterThan(withdrawals[0].yearlyWithdrawal);
    });

    it("should deplete faster than non-adjusted withdrawal", () => {
      const base = {
        initialAmount: 5_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 5,
        inflationRate: 3,
      };

      const noAdj = calculateCompound({ ...base, inflationAdjustedWithdrawal: false });
      const withAdj = calculateCompound({ ...base, inflationAdjustedWithdrawal: true });

      // After 3 years, inflation-adjusted should have less remaining
      expect(withAdj[3].total).toBeLessThan(noAdj[3].total);
    });
  });

  describe("pension income (amount mode)", () => {
    it("should reduce net withdrawal by pension amount", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
        monthlyPensionIncome: 50_000,
        pensionStartYear: 0,
      });

      // Net withdrawal = 100K - 50K = 50K/month = 600K/year
      expect(result[1].yearlyWithdrawal).toBe(600_000);
      // 10M - 50K * 12 * 10 = 4M
      expect(result[10].total).toBe(4_000_000);
    });

    it("should have zero net withdrawal when pension exceeds withdrawal", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 50_000,
        withdrawalYears: 10,
        monthlyPensionIncome: 100_000,
        pensionStartYear: 0,
      });

      // Net withdrawal = max(50K - 100K, 0) = 0
      expect(result[1].yearlyWithdrawal).toBe(0);
      expect(result[10].total).toBe(10_000_000);
    });

    it("should apply pension only after pensionStartYear", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
        monthlyPensionIncome: 50_000,
        pensionStartYear: 5,
      });

      // Years 1-4: net = 100K/month = 1.2M/year (pension not active, year < 5)
      expect(result[1].yearlyWithdrawal).toBe(1_200_000);
      // Years 5-10: net = 50K/month = 600K/year (pension active, year >= 5)
      expect(result[5].yearlyWithdrawal).toBe(600_000);
      // Total: 1.2M * 4 + 0.6M * 6 = 4.8M + 3.6M = 8.4M
      // Remaining: 10M - 8.4M = 1.6M
      expect(result[10].total).toBe(1_600_000);
    });

    it("should not apply pension when pensionStartYear is undefined", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
        monthlyPensionIncome: 50_000,
      });

      // Pension not applied when pensionStartYear is undefined
      // Net withdrawal = 100K/month = 1.2M/year
      expect(result[1].yearlyWithdrawal).toBe(1_200_000);
      // 10M - 1.2M * 10 = -2M → clamped to 0
      expect(result[10].total).toBe(0);
    });
  });

  describe("other income", () => {
    it("should always apply monthlyOtherIncome during withdrawal", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
        monthlyOtherIncome: 30_000,
      });

      // Net withdrawal = 100K - 30K = 70K/month = 840K/year
      expect(result[1].yearlyWithdrawal).toBe(840_000);
      // 10M - 840K * 10 = 1.6M
      expect(result[10].total).toBe(1_600_000);
    });

    it("should apply other income even before pensionStartYear", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 0,
        monthlyWithdrawal: 100_000,
        withdrawalYears: 10,
        monthlyPensionIncome: 50_000,
        pensionStartYear: 5,
        monthlyOtherIncome: 20_000,
      });

      // Years 1-4: net = 100K - 20K = 80K/month = 960K/year (pension not active, year < 5)
      expect(result[1].yearlyWithdrawal).toBe(960_000);
      // Years 5-10: net = 100K - 50K - 20K = 30K/month = 360K/year (pension active, year >= 5)
      expect(result[5].yearlyWithdrawal).toBe(360_000);
      // Total: 960K * 4 + 360K * 6 = 3.84M + 2.16M = 6M
      // Remaining: 10M - 6M = 4M
      expect(result[10].total).toBe(4_000_000);
    });
  });

  describe("tax numerical verification", () => {
    it("should apply exactly 20.315% tax on interest", () => {
      const result = calculateCompound({
        initialAmount: 1_000_000,
        monthlyContribution: 0,
        annualReturnRate: 10,
        contributionYears: 1,
        withdrawalStartYear: 1,
        withdrawalYears: 0,
      });

      const { principal, interest, tax, total } = result[1];
      // tax = round(interest_before_tax * 0.20315)
      // total = principal + interest (after tax)
      // principal + interest + tax = currentTotal (before year-end tax)
      expect(principal).toBe(1_000_000);
      expect(tax).toBe(Math.round((interest + tax) * 0.20315));
      expect(total).toBe(principal + interest);
    });

    it("should have zero tax when taxFree", () => {
      const result = calculateCompound({
        initialAmount: 1_000_000,
        monthlyContribution: 0,
        annualReturnRate: 10,
        contributionYears: 10,
        withdrawalStartYear: 10,
        withdrawalYears: 0,
        taxFree: true,
      });

      for (const entry of result) {
        expect(entry.tax).toBe(0);
      }
    });
  });

  describe("expense ratio with withdrawal", () => {
    it("should reduce growth during withdrawal phase", () => {
      const base = {
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        contributionYears: 10,
        withdrawalStartYear: 10,
        monthlyWithdrawal: 50_000,
        withdrawalYears: 10,
      };

      const noExpense = calculateCompound({ ...base, annualReturnRate: 5 });
      const withExpense = calculateCompound({ ...base, annualReturnRate: 5, expenseRatio: 1 });
      const equiv = calculateCompound({ ...base, annualReturnRate: 4 });

      expect(withExpense[20].total).toBeLessThan(noExpense[20].total);
      expect(withExpense[20].total).toBe(equiv[20].total);
    });
  });

  describe("rate mode with gap period", () => {
    it("should fix withdrawal based on amount at start of withdrawal", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 0,
        contributionYears: 0,
        withdrawalStartYear: 5,
        annualWithdrawalRate: 4,
        withdrawalYears: 10,
      });

      // During gap (years 1-5), no withdrawal
      for (let i = 1; i <= 5; i++) {
        expect(result[i].yearlyWithdrawal).toBe(0);
        expect(result[i].isWithdrawing).toBe(false);
      }

      // Withdrawal starts at year 6
      const withdrawals = result.filter((p) => p.isWithdrawing);
      const firstYrWithdrawal = withdrawals[0].yearlyWithdrawal;
      // 10M * 4% = 400K/year (0% return, so same as initial)
      expect(firstYrWithdrawal).toBe(400_000);

      // All years should have same fixed withdrawal
      for (const w of withdrawals) {
        expect(w.yearlyWithdrawal).toBe(firstYrWithdrawal);
      }
    });

    it("should base first rate withdrawal on withdrawal-start assets before monthly growth", () => {
      const annualWithdrawalRate = 4;
      const withdrawalStartYear = 5;
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 0,
        annualReturnRate: 12,
        contributionYears: 0,
        withdrawalStartYear,
        annualWithdrawalRate,
        withdrawalYears: 1,
        taxFree: true,
      });

      const withdrawalStart = result.find((p) => p.year === withdrawalStartYear)!;
      const firstWithdrawalYear = result.find((p) => p.year === withdrawalStartYear + 1)!;

      expect(firstWithdrawalYear.yearlyWithdrawal).toBe(
        Math.round((withdrawalStart.total * annualWithdrawalRate) / 100),
      );
    });

    it("should not reseed rate withdrawal when withdrawal-start assets are zero", () => {
      const result = calculateCompound({
        initialAmount: 0,
        monthlyContribution: 100_000,
        annualReturnRate: 0,
        contributionYears: 2,
        withdrawalStartYear: 0,
        annualWithdrawalRate: 4,
        withdrawalYears: 2,
        taxFree: true,
      });

      const withdrawals = result.filter((p) => p.isWithdrawing);
      expect(withdrawals.map((p) => p.yearlyWithdrawal)).toEqual([0, 0]);
      expect(result[2].total).toBe(2_400_000);
    });
  });

  describe("overlap with rate mode", () => {
    it("should contribute and withdraw simultaneously in rate mode", () => {
      const result = calculateCompound({
        initialAmount: 10_000_000,
        monthlyContribution: 100_000,
        annualReturnRate: 0,
        contributionYears: 10,
        withdrawalStartYear: 0,
        annualWithdrawalRate: 4,
        withdrawalYears: 10,
      });

      // Year 1 should be both contributing and withdrawing
      expect(result[1].isContributing).toBe(true);
      expect(result[1].isWithdrawing).toBe(true);
      expect(result[1].yearlyWithdrawal).toBeGreaterThan(0);
    });
  });
});
