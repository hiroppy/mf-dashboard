import { getCategoryColor } from "../../../lib/colors";
import { formatDate } from "../../../lib/format";
import { cn } from "../../../lib/utils";
import { AmountDisplay } from "../../ui/amount-display";
import { Badge } from "../../ui/badge";
import { EmptyState } from "../../ui/empty-state";
import { TypeBadge } from "../../ui/type-badge";
import type { Transaction } from "./types";

interface TransactionMobileViewProps {
  transactions: Transaction[];
}

export function TransactionMobileView({ transactions }: TransactionMobileViewProps) {
  if (transactions.length === 0) {
    return (
      <div className="md:hidden">
        <EmptyState message="取引が見つかりません" />
      </div>
    );
  }

  return (
    <div className="md:hidden space-y-3">
      {transactions.map((transaction) => (
        <div
          key={transaction.id}
          className={cn(
            "p-4 rounded-lg border bg-background",
            transaction.isTransfer && "bg-muted/30",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-foreground truncate">
              {transaction.description || "-"}
            </p>
            <AmountDisplay
              amount={transaction.amount}
              type={
                transaction.type === "income"
                  ? "income"
                  : transaction.type === "expense"
                    ? "expense"
                    : "neutral"
              }
              size="sm"
              weight="semibold"
              className={cn("whitespace-nowrap", transaction.isTransfer && "text-transfer")}
            />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDate(transaction.date)}
            {transaction.accountName && <span> / {transaction.accountName}</span>}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge
              style={{
                backgroundColor: `color-mix(in srgb, ${getCategoryColor(transaction.category ?? "振替")} 15%, transparent)`,
                borderColor: getCategoryColor(transaction.category ?? "振替"),
              }}
              className="text-sm border text-foreground"
            >
              {transaction.category ?? "振替"}
            </Badge>
            <TypeBadge type={transaction.type} isTransfer={transaction.isTransfer} />
            {transaction.isExcludedFromCalculation && <Badge variant="secondary">計算対象外</Badge>}
          </div>
        </div>
      ))}
    </div>
  );
}
