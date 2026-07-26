"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { getCategoryColor } from "../../lib/colors";
import { formatCurrency, formatDate } from "../../lib/format";
import { PieChart } from "../charts/pie-chart";
import { AmountDisplay } from "../ui/amount-display";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";

export interface CategoryTransaction {
  id: number;
  date: string;
  description: string | null;
  amount: number;
  accountName: string | null;
  category: string;
}

export interface CategoryBreakdown {
  name: string;
  value: number;
  categories: string[];
  transactions: CategoryTransaction[];
}

interface TransactionStatsClientProps {
  year: string;
  income: CategoryBreakdown[];
  expense: CategoryBreakdown[];
}

export function TransactionStatsClient({ year, income, expense }: TransactionStatsClientProps) {
  const [selection, setSelection] = useState<{ type: "income" | "expense"; name: string } | null>(
    null,
  );

  const selectedBreakdown = selection
    ? (selection.type === "income" ? income : expense).find(
        (breakdown) => breakdown.name === selection.name,
      )
    : undefined;
  const selectedTotal = selection
    ? (selection.type === "income" ? income : expense).reduce(
        (sum, breakdown) => sum + breakdown.value,
        0,
      )
    : 0;
  const selectedTransactions = selectedBreakdown
    ? [...selectedBreakdown.transactions].sort((a, b) => b.amount - a.amount)
    : [];

  const select = (type: "income" | "expense", name: string) => {
    setSelection((current) =>
      current?.type === type && current.name === name ? null : { type, name },
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        {income.length > 0 && (
          <PieChart
            title="収入カテゴリ別内訳"
            data={income}
            height={280}
            useCustomColors={false}
            selectedName={selection?.type === "income" ? selection.name : undefined}
            onSelect={(name) => select("income", name)}
          />
        )}
        {expense.length > 0 && (
          <PieChart
            title="支出カテゴリ別内訳"
            data={expense}
            height={280}
            selectedName={selection?.type === "expense" ? selection.name : undefined}
            onSelect={(name) => select("expense", name)}
          />
        )}
      </div>

      <Dialog
        open={Boolean(selection && selectedBreakdown)}
        onOpenChange={(open) => {
          if (!open) setSelection(null);
        }}
      >
        {selection && selectedBreakdown && (
          <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between gap-4 border-b px-5 py-4 sm:px-6">
              <div>
                <DialogTitle className="leading-tight">
                  {year}年 {selectedBreakdown.name}の明細
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {selectedBreakdown.name}カテゴリに含まれる年間取引の詳細
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="明細を閉じる"
                onClick={() => setSelection(null)}
              >
                <X aria-hidden="true" />
              </Button>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-4 border-b px-5 py-4 sm:grid-cols-3 sm:px-6">
              <div>
                <p className="text-sm text-muted-foreground">年間合計</p>
                <AmountDisplay
                  amount={selectedBreakdown.value}
                  type={selection.type}
                  size="xl"
                  weight="bold"
                />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">構成比</p>
                <p className="text-xl font-bold">
                  {((selectedBreakdown.value / selectedTotal) * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">取引件数</p>
                <p className="text-xl font-bold">{selectedBreakdown.transactions.length}件</p>
              </div>
            </div>

            <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
              {selectedBreakdown.categories.length > 1 && (
                <div>
                  <p className="mb-2 text-sm font-medium">含まれるカテゴリ</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedBreakdown.categories.map((category) => (
                      <Badge
                        key={category}
                        className="border text-foreground"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${getCategoryColor(category)} 15%, transparent)`,
                          borderColor: getCategoryColor(category),
                        }}
                      >
                        {category}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="divide-y divide-border rounded-lg border">
                {selectedTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {transaction.description || "内容なし"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(transaction.date)}
                        {transaction.accountName ? ` / ${transaction.accountName}` : ""}
                        {selectedBreakdown.categories.length > 1
                          ? ` / ${transaction.category}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={
                        selection.type === "income"
                          ? "shrink-0 font-semibold text-income"
                          : "shrink-0 font-semibold text-expense"
                      }
                    >
                      {formatCurrency(transaction.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
