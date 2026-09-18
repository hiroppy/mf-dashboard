import { useMemo } from "react";
import {
  calculateCompound,
  type CompoundCalculatorInput,
  type YearlyProjection,
} from "./calculate-compound";

export function useCompoundCalculator(input: CompoundCalculatorInput): YearlyProjection[] {
  const {
    initialAmount,
    monthlyContribution,
    annualReturnRate,
    contributionYears,
    withdrawalStartYear,
    withdrawalYears,
    taxFree,
    monthlyWithdrawal,
    annualWithdrawalRate,
    expenseRatio,
    inflationRate,
    inflationAdjustedWithdrawal,
    monthlyPensionIncome,
    pensionStartYear,
    monthlyOtherIncome,
  } = input;

  return useMemo(
    () =>
      calculateCompound({
        initialAmount,
        monthlyContribution,
        annualReturnRate,
        contributionYears,
        withdrawalStartYear,
        withdrawalYears,
        taxFree,
        monthlyWithdrawal,
        annualWithdrawalRate,
        expenseRatio,
        inflationRate,
        inflationAdjustedWithdrawal,
        monthlyPensionIncome,
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
      monthlyWithdrawal,
      annualWithdrawalRate,
      expenseRatio,
      inflationRate,
      inflationAdjustedWithdrawal,
      monthlyPensionIncome,
      pensionStartYear,
      monthlyOtherIncome,
    ],
  );
}
