"use client";

import { Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import type { PortfolioContext, WithdrawalMode } from "./compound-simulator-types";
import { MonteCarloChart } from "./monte-carlo-chart";
import { ProjectionChart } from "./projection-chart";
import { SettingsPanel } from "./settings-panel";
import { SummaryPanel } from "./summary-panel";
import { useCompoundSimulator } from "./use-compound-simulator";

function envNum(value: string | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

interface CompoundSimulatorProps {
  defaultInitialAmount?: number;
  defaultMonthlyContribution?: number;
  defaultAnnualReturnRate?: number;
  defaultInflationRate?: number;
  defaultWithdrawalMode?: WithdrawalMode;
  defaultWithdrawalRate?: number;
  defaultMonthlyWithdrawal?: number;
  defaultWithdrawalYears?: number;
  defaultCurrentAge?: number;
  defaultContributionYears?: number;
  defaultWithdrawalStartYear?: number;
  defaultExpenseRatio?: number;
  defaultVolatility?: number;
  defaultBasePension?: number;
  defaultPensionStartAge?: number;
  defaultMonthlyOtherIncome?: number;
  title?: string;
  portfolioContext?: PortfolioContext;
}

export function CompoundSimulator({
  defaultInitialAmount = envNum(process.env.NEXT_PUBLIC_SIMULATOR_INITIAL_AMOUNT) ?? 0,
  defaultMonthlyContribution = envNum(process.env.NEXT_PUBLIC_SIMULATOR_MONTHLY_CONTRIBUTION) ?? 0,
  defaultAnnualReturnRate = envNum(process.env.NEXT_PUBLIC_SIMULATOR_ANNUAL_RETURN_RATE) ?? 5,
  defaultInflationRate = envNum(process.env.NEXT_PUBLIC_SIMULATOR_INFLATION_RATE) ?? 2,
  defaultWithdrawalMode = (process.env.NEXT_PUBLIC_SIMULATOR_WITHDRAWAL_MODE === "rate"
    ? "rate"
    : "amount") as WithdrawalMode,
  defaultWithdrawalRate = envNum(process.env.NEXT_PUBLIC_SIMULATOR_WITHDRAWAL_RATE) ?? 4,
  defaultMonthlyWithdrawal = envNum(process.env.NEXT_PUBLIC_SIMULATOR_MONTHLY_WITHDRAWAL) ?? 250000,
  defaultWithdrawalYears = envNum(process.env.NEXT_PUBLIC_SIMULATOR_WITHDRAWAL_YEARS) ?? 30,
  defaultCurrentAge = envNum(process.env.NEXT_PUBLIC_SIMULATOR_CURRENT_AGE),
  defaultContributionYears = envNum(process.env.NEXT_PUBLIC_SIMULATOR_CONTRIBUTION_YEARS) ?? 30,
  defaultWithdrawalStartYear = envNum(process.env.NEXT_PUBLIC_SIMULATOR_WITHDRAWAL_START_YEAR) ??
    30,
  defaultExpenseRatio = envNum(process.env.NEXT_PUBLIC_SIMULATOR_EXPENSE_RATIO) ?? 0.1,
  defaultVolatility = envNum(process.env.NEXT_PUBLIC_SIMULATOR_VOLATILITY) ?? 15,
  defaultBasePension = envNum(process.env.NEXT_PUBLIC_SIMULATOR_BASE_PENSION) ?? 0,
  defaultPensionStartAge = envNum(process.env.NEXT_PUBLIC_SIMULATOR_PENSION_START_AGE) ?? 65,
  defaultMonthlyOtherIncome = envNum(process.env.NEXT_PUBLIC_SIMULATOR_MONTHLY_OTHER_INCOME) ?? 0,
  title = "複利シミュレーター",
  portfolioContext,
}: CompoundSimulatorProps) {
  const simulator = useCompoundSimulator({
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
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={Calculator}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <SettingsPanel {...simulator.settings} />
        <SummaryPanel {...simulator.summary} />
        <ProjectionChart {...simulator.projectionChart} />
        <MonteCarloChart {...simulator.monteCarloChart} />
      </CardContent>
    </Card>
  );
}
