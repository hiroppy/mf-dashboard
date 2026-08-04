export interface TransactionBase {
  type: string;
  transferTargetAccountId: number | null;
  category: string | null;
  subCategory: string | null;
  isTransfer: boolean;
  isExcludedFromCalculation: boolean;
}

interface NormalTransactionMirror {
  accountId: number | null;
  date: string | null;
  amount: number;
  type: string;
  isTransfer: boolean;
}

interface TransferMirror {
  transferTargetAccountId: number | null;
  date: string | null;
  amount: number;
}

function getTransactionMirrorKey(accountId: number, date: string, amount: number): string {
  return `${accountId}:${date}:${Math.abs(amount)}`;
}

/**
 * Money Forward may expose one cash movement both as a transfer and as a normal
 * transaction on the target account. Normal transactions are authoritative.
 */
export function createNormalTransactionMirrorKeys(
  transactions: NormalTransactionMirror[],
): Set<string> {
  const keys = new Set<string>();

  for (const transaction of transactions) {
    if (
      transaction.accountId !== null &&
      transaction.date !== null &&
      transaction.isTransfer !== true &&
      (transaction.type === "income" || transaction.type === "expense")
    ) {
      keys.add(
        getTransactionMirrorKey(transaction.accountId, transaction.date, transaction.amount),
      );
    }
  }

  return keys;
}

export function hasNormalTransactionMirror(
  transfer: TransferMirror,
  normalTransactionKeys: ReadonlySet<string>,
): boolean {
  return (
    transfer.transferTargetAccountId !== null &&
    transfer.date !== null &&
    normalTransactionKeys.has(
      getTransactionMirrorKey(transfer.transferTargetAccountId, transfer.date, transfer.amount),
    )
  );
}

/**
 * グループ外からの振替を収入に変換する
 * MoneyForwardではグループによって同じトランザクションの表示が異なる。
 * 「グループ選択なし」では振替だが、特定のグループでは収入として表示される。
 */
export function transformTransferToIncome<T extends TransactionBase>(
  transaction: T,
  groupAccountIds: number[],
): T {
  if (
    transaction.type === "transfer" &&
    transaction.transferTargetAccountId !== null &&
    !groupAccountIds.includes(transaction.transferTargetAccountId)
  ) {
    return {
      ...transaction,
      type: "income" as const,
      category: "収入",
      subCategory: "振替入金",
      isTransfer: false,
      isExcludedFromCalculation: false,
    };
  }
  return transaction;
}
