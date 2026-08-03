import { getJstTodayIsoDate, shiftYearMonthKey } from "@mf-dashboard/date-utils";
import { getAccountsWithAssets, getTransactions } from "@mf-dashboard/db";
import { Landmark } from "lucide-react";
import { EmptyState } from "../ui/empty-state";
import {
  buildBankCashFlowForecastViews,
  getBankForecastCurrentDate,
} from "./bank-cashflow-forecast-data";
import { BankCashFlowForecastClient } from "./bank-cashflow-forecast.client";

interface BankCashFlowForecastProps {
  groupId?: string;
}

export async function BankCashFlowForecast({ groupId }: BankCashFlowForecastProps) {
  const currentDate = getBankForecastCurrentDate(
    getJstTodayIsoDate(),
    process.env.DEMO_MODE === "true",
  );
  const historyStartDate = `${shiftYearMonthKey(currentDate.slice(0, 7), -12)}-01`;
  const [accounts, transactions] = await Promise.all([
    getAccountsWithAssets(groupId),
    getTransactions({ groupId, startDate: historyStartDate }),
  ]);
  const forecasts = buildBankCashFlowForecastViews(accounts, transactions, currentDate);

  if (forecasts.length === 0) {
    return <EmptyState icon={Landmark} title="今月の銀行別予測" />;
  }

  return <BankCashFlowForecastClient forecasts={forecasts} />;
}
