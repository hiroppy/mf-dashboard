import { computeSecurityScore } from "./compound-simulator-utils";
import { TAX_RATE } from "./constants";

const NUM_SIMULATIONS = 5000;
const SEED = 42;

/** Mulberry32 seeded PRNG */
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform */
function normalRandom(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

export interface MonteCarloInput {
  initialAmount: number;
  monthlyContribution: number;
  annualReturnRate: number;
  volatility: number;
  inflationRate: number;
  contributionYears: number;
  withdrawalStartYear: number;
  withdrawalYears: number;
  taxFree?: boolean;
  monthlyWithdrawal?: number;
  annualWithdrawalRate?: number;
  expenseRatio?: number;
  inflationAdjustedWithdrawal?: boolean;
  monthlyPensionIncome?: number;
  pensionStartYear?: number;
  monthlyOtherIncome?: number;
  contributionDeltas?: number[];
  rateDeltas?: number[];
}

export interface MonteCarloYearData {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  principal: number;
  isContributing: boolean;
  isWithdrawing: boolean;
  depletionRate?: number;
  medianYearlyWithdrawal?: number;
}

interface DistributionBin {
  rangeEnd: number;
  count: number;
  isDepleted: boolean;
}

export interface SensitivityRow {
  monthlyContribution: number;
  delta: number;
  depletionProbability: number;
  securityScore: number;
  medianFinalBalance: number;
  withdrawalRate?: number;
}

export interface MonteCarloResult {
  yearlyData: MonteCarloYearData[];
  failureProbability: number;
  depletionProbability: number;
  distribution: DistributionBin[];
  sensitivityRows?: SensitivityRow[];
}

export function simulateMonteCarlo({
  initialAmount,
  monthlyContribution,
  annualReturnRate,
  volatility,
  inflationRate,
  contributionYears,
  withdrawalStartYear,
  withdrawalYears,
  taxFree,
  monthlyWithdrawal = 0,
  annualWithdrawalRate,
  expenseRatio = 0,
  inflationAdjustedWithdrawal = false,
  monthlyPensionIncome = 0,
  pensionStartYear,
  monthlyOtherIncome = 0,
  contributionDeltas,
  rateDeltas,
}: MonteCarloInput): MonteCarloResult {
  const rng = mulberry32(SEED);
  const taxRate = taxFree ? 0 : TAX_RATE;
  const mu = (annualReturnRate - expenseRatio) / 100;
  const sigma = volatility / 100;
  const ri = inflationRate / 100;
  const monthlyDrift = (mu - ri - (sigma * sigma) / 2) / 12;
  const monthlySigma = sigma / Math.sqrt(12);
  const isRateMode = annualWithdrawalRate != null && annualWithdrawalRate > 0;
  // MC operates in real (inflation-adjusted) terms. A nominal withdrawal stays
  // fixed within each year, so its real value declines monthly. An annually
  // inflation-adjusted withdrawal resets to its starting real value each year.
  const monthlyRealWithdrawalFactor = !isRateMode && ri > 0 ? 1 / Math.pow(1 + ri, 1 / 12) : 1;

  const totalYears = Math.max(contributionYears, withdrawalStartYear + withdrawalYears);

  // Sensitivity analysis: extra contribution variants (delta≠0)
  const validExtraDeltas = contributionDeltas
    ? contributionDeltas.filter((d) => d !== 0 && monthlyContribution + d >= 0)
    : [];
  const numExtra = validExtraDeltas.length;
  const extraPaths: Float64Array[] = [];
  const extraCostBasis: Float64Array[] = [];
  const extraInitialWithdrawal: (Float64Array | null)[] = [];
  const extraInitialWithdrawalSeeded: (Uint8Array | null)[] = [];
  const extraCumulativeWithdrawals: Float64Array[] = [];
  const extraWithdrawalNeeded: Uint8Array[] = [];
  for (let d = 0; d < numExtra; d++) {
    extraPaths.push(new Float64Array(NUM_SIMULATIONS).fill(initialAmount));
    extraCostBasis.push(new Float64Array(NUM_SIMULATIONS).fill(initialAmount));
    extraInitialWithdrawal.push(isRateMode ? new Float64Array(NUM_SIMULATIONS) : null);
    extraInitialWithdrawalSeeded.push(isRateMode ? new Uint8Array(NUM_SIMULATIONS) : null);
    extraCumulativeWithdrawals.push(new Float64Array(NUM_SIMULATIONS));
    extraWithdrawalNeeded.push(new Uint8Array(NUM_SIMULATIONS));
  }

  // Sensitivity analysis: rate variants (for rate mode)
  const validRateDeltas =
    rateDeltas && isRateMode
      ? rateDeltas.filter((d) => d !== 0 && (annualWithdrawalRate ?? 0) + d > 0)
      : [];
  const numRateExtra = validRateDeltas.length;
  const ratePaths: Float64Array[] = [];
  const rateCostBasis: Float64Array[] = [];
  const rateInitialW: Float64Array[] = [];
  const rateInitialWSeeded: Uint8Array[] = [];
  const rateCumulativeWithdrawals: Float64Array[] = [];
  const rateWithdrawalNeeded: Uint8Array[] = [];
  for (let d = 0; d < numRateExtra; d++) {
    ratePaths.push(new Float64Array(NUM_SIMULATIONS).fill(initialAmount));
    rateCostBasis.push(new Float64Array(NUM_SIMULATIONS).fill(initialAmount));
    rateInitialW.push(new Float64Array(NUM_SIMULATIONS));
    rateInitialWSeeded.push(new Uint8Array(NUM_SIMULATIONS));
    rateCumulativeWithdrawals.push(new Float64Array(NUM_SIMULATIONS));
    rateWithdrawalNeeded.push(new Uint8Array(NUM_SIMULATIONS));
  }

  const paths = new Float64Array(NUM_SIMULATIONS).fill(initialAmount);
  const sorted = new Float64Array(NUM_SIMULATIONS);
  const yearlyData: MonteCarloYearData[] = [];

  let totalPrincipal = initialAmount;
  let failureCount = 0;

  yearlyData.push({
    year: 0,
    p10: initialAmount,
    p25: initialAmount,
    p50: initialAmount,
    p75: initialAmount,
    p90: initialAmount,
    principal: initialAmount,
    isContributing: false,
    isWithdrawing: false,
  });

  // Track cost basis per path for proportional taxation on withdrawal
  const costBasis = new Float64Array(NUM_SIMULATIONS).fill(initialAmount);
  // Track yearly withdrawal per path (for rate mode median calculation)
  const yearlyWithdrawals = isRateMode ? new Float64Array(NUM_SIMULATIONS) : null;
  // Fixed monthly withdrawal amount per path (set at withdrawal start).
  // MC portfolio values are in real terms (drift subtracts inflation).
  // Rate mode: constant real withdrawal (Trinity Study inflation-adjusted).
  const initialWithdrawalAmount = isRateMode ? new Float64Array(NUM_SIMULATIONS) : null;
  const initialWithdrawalSeeded = isRateMode ? new Uint8Array(NUM_SIMULATIONS) : null;
  // Track cumulative net withdrawals per path for total-return failure metric
  const cumulativeWithdrawals = new Float64Array(NUM_SIMULATIONS);
  const withdrawalNeeded = new Uint8Array(NUM_SIMULATIONS);
  // Deflate nominal withdrawal by inflation accumulated before withdrawal starts.
  // MC operates in real terms: a nominal fixed withdrawal loses purchasing power
  // over time, so we must account for the inflation during the pre-withdrawal period.
  const preWithdrawalDeflation =
    !isRateMode && !inflationAdjustedWithdrawal && ri > 0
      ? Math.pow(1 + ri, -withdrawalStartYear)
      : 1;
  let currentMonthlyWithdrawal = monthlyWithdrawal * preWithdrawalDeflation;

  for (let year = 1; year <= totalYears; year++) {
    const isContributing = year <= contributionYears;
    const isWithdrawing =
      year > withdrawalStartYear && year <= withdrawalStartYear + withdrawalYears;

    if (yearlyWithdrawals) yearlyWithdrawals.fill(0);
    if (isWithdrawing && !isRateMode && inflationAdjustedWithdrawal) {
      currentMonthlyWithdrawal = monthlyWithdrawal;
    }
    let annualRealIncomeFactor = 1;

    if (isWithdrawing && isRateMode) {
      if (initialWithdrawalAmount && initialWithdrawalSeeded) {
        for (let i = 0; i < NUM_SIMULATIONS; i++) {
          if (initialWithdrawalSeeded[i] === 0) {
            initialWithdrawalAmount[i] = (paths[i] * (annualWithdrawalRate ?? 0)) / 100 / 12;
            initialWithdrawalSeeded[i] = 1;
          }
        }
      }

      for (let d = 0; d < numExtra; d++) {
        const ewa = extraInitialWithdrawal[d];
        const ewaSeeded = extraInitialWithdrawalSeeded[d];
        if (ewa && ewaSeeded) {
          for (let i = 0; i < NUM_SIMULATIONS; i++) {
            if (ewaSeeded[i] === 0) {
              ewa[i] = (extraPaths[d][i] * (annualWithdrawalRate ?? 0)) / 100 / 12;
              ewaSeeded[i] = 1;
            }
          }
        }
      }

      for (let d = 0; d < numRateExtra; d++) {
        const adjRate = annualWithdrawalRate! + validRateDeltas[d];
        const rwaSeeded = rateInitialWSeeded[d];
        for (let i = 0; i < NUM_SIMULATIONS; i++) {
          if (rwaSeeded[i] === 0) {
            rateInitialW[d][i] = (ratePaths[d][i] * adjRate) / 100 / 12;
            rwaSeeded[i] = 1;
          }
        }
      }
    }

    for (let month = 0; month < 12; month++) {
      if (isWithdrawing && !isRateMode) {
        currentMonthlyWithdrawal *= monthlyRealWithdrawalFactor;
        if (inflationAdjustedWithdrawal) {
          annualRealIncomeFactor *= monthlyRealWithdrawalFactor;
        }
      }
      for (let i = 0; i < NUM_SIMULATIONS; i++) {
        const z = normalRandom(rng);
        const growthFactor = Math.exp(monthlyDrift + monthlySigma * z);

        paths[i] *= growthFactor;

        if (isContributing) {
          paths[i] += monthlyContribution;
          costBasis[i] += monthlyContribution;
        }

        if (isWithdrawing) {
          let baseWithdrawal: number;
          if (isRateMode && initialWithdrawalAmount) {
            baseWithdrawal = initialWithdrawalAmount[i];
          } else {
            baseWithdrawal = currentMonthlyWithdrawal;
          }
          const pensionActive = pensionStartYear != null && year >= pensionStartYear;
          const nominalIncome = (pensionActive ? monthlyPensionIncome : 0) + monthlyOtherIncome;
          const income = nominalIncome * annualRealIncomeFactor;
          const requestedNetWithdrawal = Math.max(baseWithdrawal - income, 0);
          if (requestedNetWithdrawal > 0) withdrawalNeeded[i] = 1;
          if (paths[i] > 0) {
            const gainRatio = paths[i] > costBasis[i] ? (paths[i] - costBasis[i]) / paths[i] : 0;
            const effectiveTaxRate = gainRatio * taxRate;
            const requiredGrossWithdrawal =
              requestedNetWithdrawal / Math.max(1 - effectiveTaxRate, Number.EPSILON);
            const grossWithdrawal = Math.min(requiredGrossWithdrawal, paths[i]);
            const actualNetWithdrawal = grossWithdrawal * (1 - effectiveTaxRate);
            if (yearlyWithdrawals) yearlyWithdrawals[i] += actualNetWithdrawal;
            cumulativeWithdrawals[i] += actualNetWithdrawal;
            const withdrawalRatio = grossWithdrawal / paths[i];
            costBasis[i] *= 1 - withdrawalRatio;
            paths[i] -= grossWithdrawal;
          }
        }

        // Sensitivity analysis: extra contribution variants
        for (let d = 0; d < numExtra; d++) {
          extraPaths[d][i] *= growthFactor;
          if (isContributing) {
            const mc = monthlyContribution + validExtraDeltas[d];
            extraPaths[d][i] += mc;
            extraCostBasis[d][i] += mc;
          }
          if (isWithdrawing) {
            let baseW: number;
            const ewa = extraInitialWithdrawal[d];
            if (isRateMode && ewa) {
              baseW = ewa[i];
            } else {
              baseW = currentMonthlyWithdrawal;
            }
            const pensionActiveExtra = pensionStartYear != null && year >= pensionStartYear;
            const nominalIncomeExtra =
              (pensionActiveExtra ? monthlyPensionIncome : 0) + monthlyOtherIncome;
            const incomeExtra = nominalIncomeExtra * annualRealIncomeFactor;
            const requestedNetW = Math.max(baseW - incomeExtra, 0);
            if (requestedNetW > 0) extraWithdrawalNeeded[d][i] = 1;
            if (extraPaths[d][i] > 0) {
              const gr =
                extraPaths[d][i] > extraCostBasis[d][i]
                  ? (extraPaths[d][i] - extraCostBasis[d][i]) / extraPaths[d][i]
                  : 0;
              const effectiveTaxRate = gr * taxRate;
              const requiredGrossW = requestedNetW / Math.max(1 - effectiveTaxRate, Number.EPSILON);
              const grossW = Math.min(requiredGrossW, extraPaths[d][i]);
              const actualNetW = grossW * (1 - effectiveTaxRate);
              extraCumulativeWithdrawals[d][i] += actualNetW;
              const wr = grossW / extraPaths[d][i];
              extraCostBasis[d][i] *= 1 - wr;
              extraPaths[d][i] -= grossW;
            }
          }
        }

        // Sensitivity analysis: rate delta variants (same contribution, different withdrawal rate)
        for (let d = 0; d < numRateExtra; d++) {
          ratePaths[d][i] *= growthFactor;
          if (isContributing) {
            ratePaths[d][i] += monthlyContribution;
            rateCostBasis[d][i] += monthlyContribution;
          }
          if (isWithdrawing) {
            const rwa = rateInitialW[d];
            const baseW = rwa[i];
            const pensionActiveR = pensionStartYear != null && year >= pensionStartYear;
            const incomeR = (pensionActiveR ? monthlyPensionIncome : 0) + monthlyOtherIncome;
            const requestedNetW = Math.max(baseW - incomeR, 0);
            if (requestedNetW > 0) rateWithdrawalNeeded[d][i] = 1;
            if (ratePaths[d][i] > 0) {
              const gr =
                ratePaths[d][i] > rateCostBasis[d][i]
                  ? (ratePaths[d][i] - rateCostBasis[d][i]) / ratePaths[d][i]
                  : 0;
              const effectiveTaxRate = gr * taxRate;
              const requiredGrossW = requestedNetW / Math.max(1 - effectiveTaxRate, Number.EPSILON);
              const grossW = Math.min(requiredGrossW, ratePaths[d][i]);
              const actualNetW = grossW * (1 - effectiveTaxRate);
              rateCumulativeWithdrawals[d][i] += actualNetW;
              const wr = grossW / ratePaths[d][i];
              rateCostBasis[d][i] *= 1 - wr;
              ratePaths[d][i] -= grossW;
            }
          }
        }
      }

      if (isContributing) {
        totalPrincipal += monthlyContribution;
      }
    }

    sorted.set(paths);
    sorted.sort();

    let yearDepletionCount = 0;
    if (isWithdrawing) {
      for (let i = 0; i < NUM_SIMULATIONS; i++) {
        // 枯渇 = ポートフォリオが0 かつ 実際に引出しが必要だった（収入だけではカバーできない）
        if (paths[i] <= 0 && withdrawalNeeded[i] > 0) yearDepletionCount++;
      }
    }

    // Compute median yearly withdrawal for rate mode
    let medianYearlyWithdrawal: number | undefined;
    if (isWithdrawing && yearlyWithdrawals) {
      const sortedWithdrawals = new Float64Array(yearlyWithdrawals);
      sortedWithdrawals.sort();
      medianYearlyWithdrawal = Math.round(sortedWithdrawals[Math.floor(NUM_SIMULATIONS * 0.5)]);
    }

    yearlyData.push({
      year,
      p10: Math.round(sorted[Math.floor(NUM_SIMULATIONS * 0.1)]),
      p25: Math.round(sorted[Math.floor(NUM_SIMULATIONS * 0.25)]),
      p50: Math.round(sorted[Math.floor(NUM_SIMULATIONS * 0.5)]),
      p75: Math.round(sorted[Math.floor(NUM_SIMULATIONS * 0.75)]),
      p90: Math.round(sorted[Math.floor(NUM_SIMULATIONS * 0.9)]),
      principal: Math.round(Math.min(totalPrincipal, sorted[Math.floor(NUM_SIMULATIONS * 0.5)])),
      isContributing,
      isWithdrawing,
      ...(isWithdrawing ? { depletionRate: yearDepletionCount / NUM_SIMULATIONS } : {}),
      ...(medianYearlyWithdrawal != null ? { medianYearlyWithdrawal } : {}),
    });
  }

  // Measure total-return loss: (remaining portfolio + cumulative withdrawals) < total invested
  for (let i = 0; i < NUM_SIMULATIONS; i++) {
    if (paths[i] + cumulativeWithdrawals[i] < totalPrincipal) failureCount++;
  }

  const depletionProbability = yearlyData.at(-1)?.depletionRate ?? 0;

  // Build distribution histogram from final-year sorted values
  // Bin width based on p90 for readable ranges; tail extends with same width
  const NUM_MAIN_BINS = 10;
  const MAX_TAIL_BINS = 5;
  const distribution: DistributionBin[] = [];
  const p90Val = sorted[Math.floor(NUM_SIMULATIONS * 0.9)];
  const maxVal = sorted[NUM_SIMULATIONS - 1];

  let depletedCnt = 0;
  for (let i = 0; i < NUM_SIMULATIONS; i++) {
    if (paths[i] <= 0 && withdrawalNeeded[i] > 0) depletedCnt++;
  }
  if (depletedCnt > 0) {
    distribution.push({ rangeEnd: 0, count: depletedCnt, isDepleted: true });
  }

  if (maxVal > 0) {
    const binWidth = Math.max(p90Val, 1) / NUM_MAIN_BINS;
    const maxBins = NUM_MAIN_BINS + MAX_TAIL_BINS;
    const neededBins = Math.min(Math.ceil(maxVal / binWidth), maxBins);
    const binCounts = new Array(neededBins).fill(0) as number[];
    for (let i = 0; i < NUM_SIMULATIONS; i++) {
      if (sorted[i] > 0) {
        const idx = Math.min(Math.floor(sorted[i] / binWidth), neededBins - 1);
        binCounts[idx]++;
      }
    }
    for (let b = 0; b < neededBins; b++) {
      distribution.push({
        rangeEnd: Math.round((b + 1) * binWidth),
        count: binCounts[b],
        isDepleted: false,
      });
    }
  }

  // Compute sensitivity analysis rows
  let sensitivityRows: SensitivityRow[] | undefined;
  const fp = failureCount / NUM_SIMULATIONS;

  if (rateDeltas && rateDeltas.length > 0 && isRateMode) {
    // Rate mode: vary withdrawal rate
    const allRateDeltas = [...new Set([...rateDeltas, 0])]
      .filter((d) => (annualWithdrawalRate ?? 0) + d > 0)
      .sort((a, b) => a - b);
    const extraSorted = new Float64Array(NUM_SIMULATIONS);

    sensitivityRows = allRateDeltas.map((delta) => {
      const rate = Math.round(((annualWithdrawalRate ?? 0) + delta) * 10) / 10;
      if (delta === 0) {
        const median = Math.round(sorted[Math.floor(NUM_SIMULATIONS * 0.5)]);
        return {
          monthlyContribution,
          delta: 0,
          depletionProbability,
          securityScore: computeSecurityScore(depletionProbability, fp, median <= 0),
          medianFinalBalance: median,
          withdrawalRate: rate,
        };
      }
      const idx = validRateDeltas.indexOf(delta);
      let depletedCount = 0;
      let rateFailureCount = 0;
      if (withdrawalYears > 0) {
        for (let i = 0; i < NUM_SIMULATIONS; i++) {
          if (ratePaths[idx][i] <= 0 && rateWithdrawalNeeded[idx][i] > 0) depletedCount++;
          if (ratePaths[idx][i] + rateCumulativeWithdrawals[idx][i] < totalPrincipal) {
            rateFailureCount++;
          }
        }
      }
      const dp = withdrawalYears > 0 ? depletedCount / NUM_SIMULATIONS : 0;
      const efp = withdrawalYears > 0 ? rateFailureCount / NUM_SIMULATIONS : 0;
      extraSorted.set(ratePaths[idx]);
      extraSorted.sort();
      const median = Math.round(extraSorted[Math.floor(NUM_SIMULATIONS * 0.5)]);
      return {
        monthlyContribution,
        delta,
        depletionProbability: dp,
        securityScore: computeSecurityScore(dp, efp, median <= 0),
        medianFinalBalance: median,
        withdrawalRate: rate,
      };
    });
  } else if (contributionDeltas && contributionDeltas.length > 0) {
    // Amount mode: vary contribution
    const allDeltas = [...new Set([...contributionDeltas, 0])]
      .filter((d) => monthlyContribution + d >= 0)
      .sort((a, b) => a - b);
    const extraSorted = new Float64Array(NUM_SIMULATIONS);

    sensitivityRows = allDeltas.map((delta) => {
      if (delta === 0) {
        const median = Math.round(sorted[Math.floor(NUM_SIMULATIONS * 0.5)]);
        return {
          monthlyContribution,
          delta: 0,
          depletionProbability,
          securityScore: computeSecurityScore(depletionProbability, fp, median <= 0),
          medianFinalBalance: median,
        };
      }
      const idx = validExtraDeltas.indexOf(delta);
      const adjustedTotalPrincipal =
        initialAmount + (monthlyContribution + delta) * contributionYears * 12;
      let depletedCount = 0;
      let extraFailureCount = 0;
      if (withdrawalYears > 0) {
        for (let i = 0; i < NUM_SIMULATIONS; i++) {
          if (extraPaths[idx][i] <= 0 && extraWithdrawalNeeded[idx][i] > 0) depletedCount++;
          if (extraPaths[idx][i] + extraCumulativeWithdrawals[idx][i] < adjustedTotalPrincipal) {
            extraFailureCount++;
          }
        }
      }
      const dp = withdrawalYears > 0 ? depletedCount / NUM_SIMULATIONS : 0;
      const efp = withdrawalYears > 0 ? extraFailureCount / NUM_SIMULATIONS : 0;
      extraSorted.set(extraPaths[idx]);
      extraSorted.sort();
      const median = Math.round(extraSorted[Math.floor(NUM_SIMULATIONS * 0.5)]);
      return {
        monthlyContribution: monthlyContribution + delta,
        delta,
        depletionProbability: dp,
        securityScore: computeSecurityScore(dp, efp, median <= 0),
        medianFinalBalance: median,
      };
    });
  }

  return {
    yearlyData,
    failureProbability: failureCount / NUM_SIMULATIONS,
    depletionProbability,
    distribution,
    sensitivityRows,
  };
}
