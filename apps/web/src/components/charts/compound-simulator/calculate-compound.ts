import { TAX_RATE } from "./constants";

export interface CompoundCalculatorInput {
  initialAmount: number;
  monthlyContribution: number;
  annualReturnRate: number;
  contributionYears: number;
  withdrawalStartYear: number;
  withdrawalYears: number;
  taxFree?: boolean;
  monthlyWithdrawal?: number;
  annualWithdrawalRate?: number;
  expenseRatio?: number;
  inflationRate?: number;
  inflationAdjustedWithdrawal?: boolean;
  monthlyPensionIncome?: number;
}

export interface YearlyProjection {
  year: number;
  principal: number;
  interest: number;
  tax: number;
  total: number;
  yearlyWithdrawal: number;
  isContributing: boolean;
  isWithdrawing: boolean;
}

export function calculateCompound({
  initialAmount,
  monthlyContribution,
  annualReturnRate,
  contributionYears,
  withdrawalStartYear,
  withdrawalYears,
  taxFree,
  monthlyWithdrawal = 0,
  annualWithdrawalRate,
  expenseRatio = 0,
  inflationRate = 0,
  inflationAdjustedWithdrawal = false,
  monthlyPensionIncome = 0,
}: CompoundCalculatorInput): YearlyProjection[] {
  const projections: YearlyProjection[] = [];
  const monthlyRate = Math.pow(1 + (annualReturnRate - expenseRatio) / 100, 1 / 12) - 1;
  const taxRate = taxFree ? 0 : TAX_RATE;
  const ri = inflationRate / 100;
  const isRateMode = annualWithdrawalRate != null && annualWithdrawalRate > 0;
  const monthlyInflationFactor = ri > 0 ? Math.pow(1 + ri, 1 / 12) : 1;

  const totalYears = Math.max(contributionYears, withdrawalStartYear + withdrawalYears);

  let currentTotal = initialAmount;
  let totalPrincipal = initialAmount;
  let currentMonthlyWithdrawal = monthlyWithdrawal;
  let rateBasedMonthlyWithdrawal = 0;
  let rateFirstWithdrawalYear = -1;

  for (let year = 0; year <= totalYears; year++) {
    const isContributing = year > 0 && year <= contributionYears;
    const isWithdrawing =
      year > withdrawalStartYear && year <= withdrawalStartYear + withdrawalYears;

    if (year === 0) {
      projections.push({
        year,
        principal: initialAmount,
        interest: 0,
        tax: 0,
        total: initialAmount,
        yearlyWithdrawal: 0,
        isContributing: false,
        isWithdrawing: false,
      });
      continue;
    }

    let yearlyWithdrawalTotal = 0;

    for (let month = 0; month < 12; month++) {
      currentTotal *= 1 + monthlyRate;

      if (isContributing) {
        currentTotal += monthlyContribution;
        totalPrincipal += monthlyContribution;
      }

      if (isWithdrawing && currentTotal > 0) {
        let baseWithdrawal: number;
        if (isRateMode) {
          if (rateBasedMonthlyWithdrawal === 0) {
            rateBasedMonthlyWithdrawal = (currentTotal * annualWithdrawalRate) / 100 / 12;
            rateFirstWithdrawalYear = year;
          } else if (month === 0 && year > rateFirstWithdrawalYear) {
            rateBasedMonthlyWithdrawal *= 1 + ri;
          }
          baseWithdrawal = rateBasedMonthlyWithdrawal;
        } else {
          baseWithdrawal = currentMonthlyWithdrawal;
          if (inflationAdjustedWithdrawal) {
            currentMonthlyWithdrawal *= monthlyInflationFactor;
          }
        }
        const netWithdrawal = Math.max(baseWithdrawal - monthlyPensionIncome, 0);
        yearlyWithdrawalTotal += netWithdrawal;
        const gainRatio =
          currentTotal > totalPrincipal ? (currentTotal - totalPrincipal) / currentTotal : 0;
        const taxOnWithdrawal = netWithdrawal * gainRatio * taxRate;
        const withdrawalRatio = Math.min(netWithdrawal / currentTotal, 1);
        totalPrincipal *= 1 - withdrawalRatio;
        currentTotal -= netWithdrawal + taxOnWithdrawal;
        if (currentTotal < 0) currentTotal = 0;
      }
    }

    const interest = currentTotal - totalPrincipal;
    const tax = interest > 0 ? Math.round(interest * taxRate) : 0;
    const afterTax = currentTotal - tax;

    projections.push({
      year,
      principal: Math.round(Math.min(totalPrincipal, currentTotal)),
      interest: interest > 0 ? Math.round(interest) - tax : 0,
      tax,
      total: Math.round(Math.max(afterTax, 0)),
      yearlyWithdrawal: Math.round(yearlyWithdrawalTotal),
      isContributing,
      isWithdrawing,
    });
  }

  return projections;
}
