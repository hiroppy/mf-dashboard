import { useCallback, useMemo, useState } from "react";
import type { CompoundCalculatorInput } from "./calculate-compound";
import type {
  DrawdownPercentile,
  PortfolioContext,
  WithdrawalMode,
} from "./compound-simulator-types";
import {
  buildFanChartData,
  computeMcDrawdownEndValue,
  computeMonthlyWithdrawalForSummary,
  computeRateWithdrawalBasis,
  computeSecurityScore,
  computeSummaryYear,
  computeTotalWithdrawalAmount,
  computeTotalYears,
  computeWithdrawalMilestones,
  selectMilestones,
} from "./compound-simulator-utils";
import { generateSummary } from "./generate-summary";
import { adjustedPension } from "./pension-utils";
import { PRODUCT_PRESETS } from "./product-presets";
import type { MonteCarloInput } from "./simulate-monte-carlo";
import { useCompoundCalculator } from "./use-compound-calculator";
import { useMonteCarloSimulator } from "./use-monte-carlo-simulator";

const PENSION_NET_RATE = 0.85;
const SENSITIVITY_CONTRIBUTION_DELTAS = [
  -20_000, -10_000, 0, 10_000, 20_000, 30_000, 50_000, 100_000, 200_000, 300_000,
];
const SENSITIVITY_RATE_DELTAS = [-3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];

export interface UseCompoundSimulatorInput {
  defaultInitialAmount: number;
  defaultMonthlyContribution: number;
  defaultAnnualReturnRate: number;
  defaultInflationRate: number;
  defaultWithdrawalMode: WithdrawalMode;
  defaultWithdrawalRate: number;
  defaultMonthlyWithdrawal: number;
  defaultWithdrawalYears: number;
  defaultCurrentAge?: number;
  defaultContributionYears: number;
  defaultWithdrawalStartYear: number;
  defaultExpenseRatio: number;
  defaultVolatility: number;
  defaultBasePension: number;
  defaultPensionStartAge: number;
  defaultMonthlyOtherIncome: number;
  portfolioContext?: PortfolioContext;
}

export function useCompoundSimulator({
  defaultInitialAmount,
  defaultMonthlyContribution,
  defaultAnnualReturnRate,
  defaultInflationRate,
  defaultWithdrawalMode,
  defaultWithdrawalRate,
  defaultMonthlyWithdrawal,
  defaultWithdrawalYears,
  defaultCurrentAge,
  defaultContributionYears,
  defaultWithdrawalStartYear,
  defaultExpenseRatio,
  defaultVolatility,
  defaultBasePension,
  defaultPensionStartAge,
  defaultMonthlyOtherIncome,
  portfolioContext,
}: UseCompoundSimulatorInput) {
  const [initialAmount, setInitialAmount] = useState(defaultInitialAmount);
  const [monthlyContribution, setMonthlyContribution] = useState(defaultMonthlyContribution);
  const [annualReturnRate, setAnnualReturnRate] = useState(defaultAnnualReturnRate);
  const [expenseRatio, setExpenseRatio] = useState(defaultExpenseRatio);
  const [inflationRate, setInflationRate] = useState(defaultInflationRate);
  const [contributionYears, setContributionYears] = useState(defaultContributionYears);
  const [withdrawalStartYear, setWithdrawalStartYear] = useState(defaultWithdrawalStartYear);
  const [withdrawalYears, setWithdrawalYears] = useState(defaultWithdrawalYears);
  const [volatility, setVolatility] = useState(defaultVolatility);
  const [taxFree, setTaxFree] = useState(false);
  const [withdrawalMode, setWithdrawalMode] = useState<WithdrawalMode>(defaultWithdrawalMode);
  const [withdrawalRate, setWithdrawalRate] = useState(defaultWithdrawalRate);
  const [fixedMonthlyWithdrawal, setFixedMonthlyWithdrawal] = useState(defaultMonthlyWithdrawal);
  const [inflationAdjustedWithdrawal, setInflationAdjustedWithdrawal] = useState(false);
  const [currentAge, setCurrentAge] = useState<number | undefined>(defaultCurrentAge);
  const [selectedPreset, setSelectedPreset] = useState("custom");
  const [basePension, setBasePension] = useState(defaultBasePension);
  const [pensionStartAge, setPensionStartAge] = useState(defaultPensionStartAge);
  const [monthlyOtherIncome, setMonthlyOtherIncome] = useState(defaultMonthlyOtherIncome);
  const [drawdownPercentile, setDrawdownPercentile] = useState<DrawdownPercentile>("p50");

  const adjustedMonthlyPension = useMemo(
    () => Math.round(adjustedPension(basePension, pensionStartAge) * PENSION_NET_RATE),
    [basePension, pensionStartAge],
  );
  const pensionStartYear = useMemo(
    () => (currentAge != null ? Math.max(0, pensionStartAge - currentAge) : undefined),
    [currentAge, pensionStartAge],
  );

  const compoundInput = useMemo<CompoundCalculatorInput>(
    () => ({
      initialAmount,
      monthlyContribution,
      annualReturnRate,
      contributionYears,
      withdrawalStartYear,
      withdrawalYears,
      taxFree,
      ...(withdrawalMode === "rate"
        ? { annualWithdrawalRate: withdrawalRate }
        : { monthlyWithdrawal: fixedMonthlyWithdrawal }),
      expenseRatio,
      inflationRate,
      inflationAdjustedWithdrawal:
        withdrawalMode === "amount" ? inflationAdjustedWithdrawal : false,
      monthlyPensionIncome: currentAge != null ? adjustedMonthlyPension : 0,
      pensionStartYear,
      monthlyOtherIncome,
    }),
    [
      initialAmount,
      monthlyContribution,
      annualReturnRate,
      contributionYears,
      withdrawalStartYear,
      withdrawalYears,
      taxFree,
      withdrawalMode,
      withdrawalRate,
      fixedMonthlyWithdrawal,
      expenseRatio,
      inflationRate,
      inflationAdjustedWithdrawal,
      currentAge,
      adjustedMonthlyPension,
      pensionStartYear,
      monthlyOtherIncome,
    ],
  );
  const projections = useCompoundCalculator(compoundInput);

  const monteCarloInput = useMemo<MonteCarloInput>(() => {
    const input: MonteCarloInput = {
      initialAmount,
      monthlyContribution,
      annualReturnRate,
      volatility,
      inflationRate,
      contributionYears,
      withdrawalStartYear,
      withdrawalYears,
      taxFree,
      ...(withdrawalMode === "rate"
        ? { annualWithdrawalRate: withdrawalRate }
        : { monthlyWithdrawal: fixedMonthlyWithdrawal }),
      expenseRatio,
      inflationAdjustedWithdrawal:
        withdrawalMode === "amount" ? inflationAdjustedWithdrawal : false,
      monthlyPensionIncome: currentAge != null ? adjustedMonthlyPension : 0,
      pensionStartYear,
      monthlyOtherIncome,
    };

    if (withdrawalYears > 0 && contributionYears > 0 && withdrawalMode === "amount") {
      input.contributionDeltas = SENSITIVITY_CONTRIBUTION_DELTAS;
    }
    if (withdrawalYears > 0 && withdrawalMode === "rate") {
      input.rateDeltas = SENSITIVITY_RATE_DELTAS;
    }

    return input;
  }, [
    initialAmount,
    monthlyContribution,
    annualReturnRate,
    volatility,
    inflationRate,
    contributionYears,
    withdrawalStartYear,
    withdrawalYears,
    taxFree,
    withdrawalMode,
    withdrawalRate,
    fixedMonthlyWithdrawal,
    expenseRatio,
    inflationAdjustedWithdrawal,
    currentAge,
    adjustedMonthlyPension,
    pensionStartYear,
    monthlyOtherIncome,
  ]);
  const [monteCarlo, requestImmediateMC] = useMonteCarloSimulator(monteCarloInput);

  const currentYear = new Date().getFullYear();
  const summaryYear = computeSummaryYear(contributionYears, withdrawalStartYear, withdrawalYears);
  const contributionEnd =
    projections.find((p) => p.year === summaryYear) ?? projections.find((p) => p.year === 0);

  const fanChartData = buildFanChartData(monteCarlo.yearlyData);
  const mcMedianIsZero =
    monteCarlo.yearlyData.length > 0 && (monteCarlo.yearlyData.at(-1)?.p50 ?? 0) <= 0;
  const securityScore = computeSecurityScore(
    monteCarlo.depletionProbability,
    monteCarlo.failureProbability,
    mcMedianIsZero,
  );

  const sensitivityRows = monteCarlo.sensitivityRows ?? [];
  const sensitivityTableRows =
    withdrawalMode === "rate"
      ? sensitivityRows.filter((r) => r.delta >= -0.5)
      : sensitivityRows.filter((r) => Math.abs(r.delta) <= 30_000);

  const mcDrawdownEndValue = computeMcDrawdownEndValue(
    withdrawalYears,
    monteCarlo.yearlyData,
    drawdownPercentile,
  );
  const monthlyWithdrawalForSummary = computeMonthlyWithdrawalForSummary(
    withdrawalMode,
    projections,
    withdrawalStartYear,
    fixedMonthlyWithdrawal,
  );
  const rateWithdrawalBasis = computeRateWithdrawalBasis(contributionEnd);
  const initialAnnualWithdrawal = Math.round((rateWithdrawalBasis * withdrawalRate) / 100);
  const initialMonthlyWithdrawal = Math.round((rateWithdrawalBasis * withdrawalRate) / 100 / 12);
  const withdrawalMilestones =
    withdrawalMode === "rate"
      ? computeWithdrawalMilestones(withdrawalYears, withdrawalStartYear, projections)
      : undefined;
  const summary = contributionEnd
    ? generateSummary({
        initialAmount,
        monthlyContribution,
        annualReturnRate,
        contributionYears,
        withdrawalStartYear,
        withdrawalYears,
        finalTotal: contributionEnd.total,
        finalPrincipal: contributionEnd.principal,
        finalInterest: contributionEnd.interest,
        monthlyWithdrawal: monthlyWithdrawalForSummary,
        grossMonthlyExpense: withdrawalMode === "amount" ? fixedMonthlyWithdrawal : undefined,
        monthlyPensionIncome: currentAge != null ? adjustedMonthlyPension : 0,
        monthlyOtherIncome,
        drawdownFinalTotal: mcDrawdownEndValue,
        depletionProbability: monteCarlo.depletionProbability,
        pensionStartYear,
        taxFree,
        withdrawalMode,
        withdrawalRate,
        expenseRatio,
        withdrawalMilestones,
        currentAge,
      })
    : null;
  const milestones = selectMilestones(contributionEnd?.total ?? 0);
  const totalWithdrawalAmount = computeTotalWithdrawalAmount(withdrawalYears, projections);
  const totalYears = computeTotalYears(contributionYears, withdrawalStartYear, withdrawalYears);

  const handlePresetChange = useCallback((value: string) => {
    setSelectedPreset(value);
    const preset = PRODUCT_PRESETS.find((p) => p.value === value);
    if (preset && "annualReturnRate" in preset) {
      setAnnualReturnRate(preset.annualReturnRate);
      setExpenseRatio(preset.expenseRatio);
      setVolatility(preset.volatility);
    }
  }, []);

  const handleAnnualReturnRateChange = useCallback((value: number) => {
    setAnnualReturnRate(value);
    setSelectedPreset("custom");
  }, []);

  const handleExpenseRatioChange = useCallback((value: number) => {
    setExpenseRatio(value);
    setSelectedPreset("custom");
  }, []);

  const handleVolatilityChange = useCallback((value: number) => {
    setVolatility(value);
    setSelectedPreset("custom");
  }, []);

  const handleWithdrawalModeChange = useCallback(
    (value: WithdrawalMode) => {
      requestImmediateMC();
      setWithdrawalMode(value);
    },
    [requestImmediateMC],
  );

  const handleTaxFreeChange = useCallback(
    (value: boolean) => {
      requestImmediateMC();
      setTaxFree(value);
    },
    [requestImmediateMC],
  );

  const handleInflationAdjustedWithdrawalChange = useCallback(
    (value: boolean) => {
      requestImmediateMC();
      setInflationAdjustedWithdrawal(value);
    },
    [requestImmediateMC],
  );

  const handleApplyMonthly = useCallback(
    (amount: number) => {
      setMonthlyContribution(amount);
      requestImmediateMC();
    },
    [requestImmediateMC],
  );

  const handleApplyRate = useCallback(
    (rate: number) => {
      setWithdrawalRate(rate);
      requestImmediateMC();
    },
    [requestImmediateMC],
  );

  const effectiveReturn = annualReturnRate - expenseRatio;
  const mcPercentiles =
    withdrawalYears > 0 && monteCarlo.yearlyData.length > 0
      ? (() => {
          const last = monteCarlo.yearlyData.at(-1)!;
          return {
            p10: last.p10,
            p25: last.p25,
            p50: last.p50,
            p75: last.p75,
            p90: last.p90,
          };
        })()
      : null;
  const copyData = {
    settings: {
      currentAge,
      initialAmount,
      monthlyContribution,
      annualReturnRate,
      expenseRatio,
      effectiveReturn: Math.round(effectiveReturn * 100) / 100,
      inflationRate,
      realReturn: Math.round((effectiveReturn - inflationRate) * 100) / 100,
      volatility,
      contributionYears,
      withdrawalStartYear,
      withdrawalYears,
      withdrawalMode,
      ...(withdrawalMode === "rate"
        ? { withdrawalRate }
        : {
            fixedMonthlyWithdrawal,
            inflationAdjustedWithdrawal,
          }),
      taxFree,
      basePension,
      pensionStartAge,
      adjustedMonthlyPension: currentAge != null ? adjustedMonthlyPension : 0,
      pensionStartYear,
      monthlyOtherIncome,
      selectedPreset,
    },
    results: {
      principal: contributionEnd?.principal ?? 0,
      interest: contributionEnd?.interest ?? 0,
      tax: contributionEnd?.tax ?? 0,
      total: contributionEnd?.total ?? 0,
      monthlyWithdrawal: monthlyWithdrawalForSummary,
      totalWithdrawalAmount,
    },
    monteCarlo: {
      drawdownPercentile,
      mcDrawdownEndValue: mcDrawdownEndValue ?? 0,
      depletionProbability: monteCarlo.depletionProbability,
      failureProbability: monteCarlo.failureProbability,
      securityScore,
      finalPercentiles: mcPercentiles,
      distribution: monteCarlo.distribution,
    },
    ...(sensitivityRows.length > 0
      ? {
          sensitivity: sensitivityRows.map((r) => ({
            monthlyContribution: r.monthlyContribution,
            medianFinalBalance: r.medianFinalBalance,
            depletionProbability: r.depletionProbability,
          })),
        }
      : {}),
  };

  return {
    settings: {
      currentAge,
      onCurrentAgeChange: setCurrentAge,
      contributionYears,
      onContributionYearsChange: setContributionYears,
      withdrawalStartYear,
      onWithdrawalStartYearChange: setWithdrawalStartYear,
      withdrawalYears,
      onWithdrawalYearsChange: setWithdrawalYears,
      selectedPreset,
      onPresetChange: handlePresetChange,
      initialAmount,
      onInitialAmountChange: setInitialAmount,
      monthlyContribution,
      onMonthlyContributionChange: setMonthlyContribution,
      annualReturnRate,
      onAnnualReturnRateChange: handleAnnualReturnRateChange,
      expenseRatio,
      onExpenseRatioChange: handleExpenseRatioChange,
      withdrawalMode,
      onWithdrawalModeChange: handleWithdrawalModeChange,
      withdrawalRate,
      onWithdrawalRateChange: setWithdrawalRate,
      fixedMonthlyWithdrawal,
      onFixedMonthlyWithdrawalChange: setFixedMonthlyWithdrawal,
      initialAnnualWithdrawal,
      initialMonthlyWithdrawal,
      monthlyWithdrawalForSummary,
      adjustedMonthlyPension,
      basePension,
      onBasePensionChange: setBasePension,
      pensionStartAge,
      onPensionStartAgeChange: setPensionStartAge,
      monthlyOtherIncome,
      onMonthlyOtherIncomeChange: setMonthlyOtherIncome,
      taxFree,
      onTaxFreeChange: handleTaxFreeChange,
      inflationAdjustedWithdrawal,
      onInflationAdjustedWithdrawalChange: handleInflationAdjustedWithdrawalChange,
      inflationRate,
      portfolioContext,
    },
    summary: {
      withdrawalYears,
      contributionYears,
      withdrawalStartYear,
      currentYear,
      currentAge,
      taxFree,
      contributionEnd,
      securityScore,
      monthlyContribution,
      withdrawalRate,
      sensitivityRows,
      sensitivityTableRows,
      onApplyMonthly: handleApplyMonthly,
      onApplyRate: handleApplyRate,
      drawdownPercentile,
      onDrawdownPercentileChange: setDrawdownPercentile,
      mcDrawdownEndValue,
      totalWithdrawalAmount,
      monteCarlo,
      summary,
    },
    projectionChart: {
      projections,
      taxFree,
      currentAge,
      contributionYears,
      withdrawalStartYear,
      withdrawalYears,
      totalYears,
      milestones,
      currentTotalAssets: portfolioContext?.currentTotalAssets,
    },
    monteCarloChart: {
      fanChartData,
      currentAge,
      taxFree,
      withdrawalYears,
      contributionYears,
      withdrawalStartYear,
      totalYears,
      inflationRate,
      onInflationRateChange: setInflationRate,
      volatility,
      onVolatilityChange: handleVolatilityChange,
      copyData,
    },
  };
}
