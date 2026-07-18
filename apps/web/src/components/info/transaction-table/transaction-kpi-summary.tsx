import { AmountDisplay } from "../../ui/amount-display";
import { MetricLabel } from "../../ui/metric-label";
import type { TransactionKpi } from "./types";

interface TransactionKpiSummaryProps {
  kpi: TransactionKpi;
  showTotals: boolean;
}

interface TransactionKpiVisibility {
  isMonthView: boolean;
  selectedDate: string | null;
  searchText: string;
  selectedCategories: string[];
  selectedTypes: string[];
  selectedAccounts: string[];
}

export function shouldShowTransactionKpiTotals({
  isMonthView,
  selectedDate,
  searchText,
  selectedCategories,
  selectedTypes,
  selectedAccounts,
}: TransactionKpiVisibility): boolean {
  if (!isMonthView) return true;

  return (
    selectedDate !== null ||
    searchText.trim() !== "" ||
    selectedCategories.length > 0 ||
    selectedTypes.length > 0 ||
    selectedAccounts.length > 0
  );
}

export function TransactionKpiSummary({ kpi, showTotals }: TransactionKpiSummaryProps) {
  return (
    <div className={showTotals ? "grid grid-cols-2 gap-3 sm:grid-cols-4" : "flex justify-end"}>
      {showTotals && (
        <>
          <div className="rounded-lg border bg-background p-3">
            <MetricLabel title="合計収入" />
            <p className="mt-0.5">
              <AmountDisplay amount={kpi.totalIncome} type="income" size="lg" weight="bold" />
            </p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <MetricLabel title="合計支出" />
            <p className="mt-0.5">
              <AmountDisplay amount={kpi.totalExpense} type="expense" size="lg" weight="bold" />
            </p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <MetricLabel title="収支" />
            <p className="mt-0.5">
              <AmountDisplay amount={kpi.balance} type="balance" size="lg" weight="bold" />
            </p>
          </div>
        </>
      )}
      <div className="rounded-lg border bg-background p-3">
        <MetricLabel title="支出中央値" />
        <p className="mt-0.5">
          <AmountDisplay amount={kpi.medianExpense} type="expense" size="lg" weight="bold" />
        </p>
      </div>
    </div>
  );
}
