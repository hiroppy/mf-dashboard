import { getAccountByMfId } from "@mf-dashboard/db";
import {
  getTransactions,
  getTransactionsByAccountId,
  getTransactionsByMonth,
} from "@mf-dashboard/db";
import { ListOrdered } from "lucide-react";
import { EmptyState } from "../../ui/empty-state";
import { TransactionTableClient } from "./transaction-table.client";

interface TransactionTableProps {
  month?: string;
  mfId?: string;
  groupId?: string;
}

export async function TransactionTable({ month, mfId, groupId }: TransactionTableProps) {
  const account = mfId ? await getAccountByMfId(mfId, groupId) : null;

  const transactions = account
    ? await getTransactionsByAccountId(account.id, groupId)
    : month
      ? await getTransactionsByMonth(month, groupId)
      : await getTransactions({ groupId });

  if (transactions.length === 0) {
    if (mfId) return null;
    return <EmptyState icon={ListOrdered} title="詳細一覧" />;
  }

  return <TransactionTableClient transactions={transactions} isMonthView={!!month} />;
}
