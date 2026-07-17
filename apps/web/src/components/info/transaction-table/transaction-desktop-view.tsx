import { getCategoryColor } from "../../../lib/colors";
import { formatDate } from "../../../lib/format";
import { cn } from "../../../lib/utils";
import { AmountDisplay } from "../../ui/amount-display";
import { Badge } from "../../ui/badge";
import { EmptyState } from "../../ui/empty-state";
import { SortableTableHead } from "../../ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../../ui/table";
import { TypeBadge } from "../../ui/type-badge";
import type { SortColumn, Transaction } from "./types";

interface TransactionDesktopViewProps {
  transactions: Transaction[];
  sortColumn: SortColumn;
  sortDirection: "asc" | "desc";
  onSort: (column: string) => void;
}

export function TransactionDesktopView({
  transactions,
  sortColumn,
  sortDirection,
  onSort,
}: TransactionDesktopViewProps) {
  // Scrollable table content must be focusable for keyboard panning.
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <section className="hidden md:block overflow-x-auto" aria-label="取引一覧" tabIndex={0}>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead
              column="date"
              label="日付"
              currentSort={sortColumn}
              currentDirection={sortDirection}
              onSort={onSort}
            />
            <SortableTableHead
              column="description"
              label="内容"
              currentSort={sortColumn}
              currentDirection={sortDirection}
              onSort={onSort}
            />
            <SortableTableHead
              column="category"
              label="カテゴリ"
              currentSort={sortColumn}
              currentDirection={sortDirection}
              onSort={onSort}
            />
            <SortableTableHead
              column="type"
              label="種別"
              currentSort={sortColumn}
              currentDirection={sortDirection}
              onSort={onSort}
            />
            <SortableTableHead
              column="accountName"
              label="保有金融機関"
              currentSort={sortColumn}
              currentDirection={sortDirection}
              onSort={onSort}
            />
            <SortableTableHead
              column="amount"
              label="金額"
              currentSort={sortColumn}
              currentDirection={sortDirection}
              onSort={onSort}
              className="text-right"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length > 0 ? (
            transactions.map((transaction) => (
              <TableRow
                key={transaction.id}
                className={cn(transaction.isTransfer && "bg-muted/30")}
              >
                <TableCell className="whitespace-nowrap">{formatDate(transaction.date)}</TableCell>
                <TableCell className="max-w-[300px] truncate">
                  {transaction.description || "-"}
                </TableCell>
                <TableCell>
                  <Badge
                    style={{
                      backgroundColor: `color-mix(in srgb, ${getCategoryColor(transaction.category ?? "振替")} 15%, transparent)`,
                      borderColor: getCategoryColor(transaction.category ?? "振替"),
                    }}
                    className="border text-foreground"
                  >
                    {transaction.category ?? "振替"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <TypeBadge type={transaction.type} isTransfer={transaction.isTransfer} />
                    {transaction.isExcludedFromCalculation && (
                      <Badge variant="secondary">計算対象外</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {transaction.accountName || "-"}
                </TableCell>
                <TableCell className="text-right">
                  <AmountDisplay
                    amount={transaction.amount}
                    type={
                      transaction.type === "income"
                        ? "income"
                        : transaction.type === "expense"
                          ? "expense"
                          : "neutral"
                    }
                    className={transaction.isTransfer ? "text-transfer" : undefined}
                  />
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6}>
                <EmptyState message="取引が見つかりません" />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}
