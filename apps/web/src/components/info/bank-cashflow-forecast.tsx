import { getJstTodayIsoDate, shiftYearMonthKey } from "@mf-dashboard/date-utils";
import {
  getBankForecastDismissals,
  getAccountsWithAssets,
  getHoldingsWithLatestValues,
  getTransactions,
} from "@mf-dashboard/db";
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

const CARD_LIABILITY_CATEGORY = "クレジットカード利用残高";

export async function BankCashFlowForecast({ groupId }: BankCashFlowForecastProps) {
  const currentDate = getBankForecastCurrentDate(
    getJstTodayIsoDate(),
    process.env.DEMO_MODE === "true",
  );
  const historyStartDate = `${shiftYearMonthKey(currentDate.slice(0, 7), -12)}-01`;
  const [accounts, transactions, holdings, dismissals] = await Promise.all([
    getAccountsWithAssets(groupId),
    getTransactions({ groupId, startDate: historyStartDate }),
    getHoldingsWithLatestValues(groupId),
    getBankForecastDismissals(groupId),
  ]);
  const liabilityAmounts = new Map<number, number>();
  for (const holding of holdings) {
    if (
      holding.type !== "liability" ||
      holding.liabilityCategory !== CARD_LIABILITY_CATEGORY ||
      holding.accountId === null ||
      holding.amount === null ||
      holding.amount <= 0
    ) {
      continue;
    }
    liabilityAmounts.set(
      holding.accountId,
      (liabilityAmounts.get(holding.accountId) ?? 0) + holding.amount,
    );
  }
  const cardLiabilities = [...liabilityAmounts].map(([accountId, amount]) => ({
    accountId,
    amount,
  }));
  const forecasts = buildBankCashFlowForecastViews(
    accounts,
    transactions,
    currentDate,
    undefined,
    cardLiabilities,
    dismissals,
  );

  if (forecasts.length === 0) {
    return <EmptyState icon={Landmark} title="今月の銀行別予測" />;
  }

  return (
    <BankCashFlowForecastClient
      forecasts={forecasts}
      groupId={groupId}
      allowForecastDismissal={process.env.VERCEL !== "1"}
    />
  );
}
