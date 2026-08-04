import { getJstTodayIsoDate, shiftYearMonthKey } from "@mf-dashboard/date-utils";
import { getAccountsWithAssets } from "@mf-dashboard/db/queries/account";
import { getBankForecastDismissals } from "@mf-dashboard/db/queries/bank-forecast-dismissal";
import { getHoldingsWithLatestValues } from "@mf-dashboard/db/queries/holding";
import { getTransactions } from "@mf-dashboard/db/queries/transaction";
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
  const [selectedAccounts, selectedTransactions, selectedHoldings, dismissals] = await Promise.all([
    getAccountsWithAssets(groupId),
    getTransactions({ groupId, startDate: historyStartDate, includeTransferTargetAccounts: true }),
    getHoldingsWithLatestValues(groupId),
    getBankForecastDismissals(groupId),
  ]);
  const selectedBankIds = new Set(
    selectedAccounts.filter(({ categoryName }) => categoryName === "銀行").map(({ id }) => id),
  );
  const counterpartCardIds = new Set(
    selectedTransactions.flatMap((transaction) =>
      transaction.accountId !== null &&
      transaction.transferTargetAccountId !== null &&
      selectedBankIds.has(transaction.transferTargetAccountId) &&
      (transaction.type === "transfer" || transaction.isTransfer)
        ? [transaction.accountId]
        : [],
    ),
  );
  const [globalAccounts, globalHoldings, globalTransactions] =
    counterpartCardIds.size === 0
      ? [[], [], []]
      : await Promise.all([
          getAccountsWithAssets("0"),
          getHoldingsWithLatestValues("0"),
          getTransactions({
            groupId: "0",
            startDate: historyStartDate,
            includeTransferTargetAccounts: true,
          }),
        ]);
  const counterpartCards = globalAccounts.filter(
    ({ id, categoryName }) => categoryName === "カード" && counterpartCardIds.has(id),
  );
  const accounts = [
    ...selectedAccounts,
    ...counterpartCards.filter(
      ({ id }) => !selectedAccounts.some((selectedAccount) => selectedAccount.id === id),
    ),
  ];
  const counterpartCardIdSet = new Set(counterpartCards.map(({ id }) => id));
  const holdings = [
    ...selectedHoldings,
    ...globalHoldings.filter(
      (holding) =>
        holding.accountId !== null &&
        counterpartCardIdSet.has(holding.accountId) &&
        !selectedHoldings.some((selectedHolding) => selectedHolding.id === holding.id),
    ),
  ];
  const transactionsById = new Map(
    selectedTransactions.map((transaction) => [transaction.id, transaction]),
  );
  for (const transaction of globalTransactions) {
    if (
      transaction.accountId !== null &&
      counterpartCardIds.has(transaction.accountId) &&
      (transaction.type === "transfer" || transaction.isTransfer)
    ) {
      transactionsById.set(transaction.id, transaction);
    }
  }
  const transactions = [...transactionsById.values()];
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
