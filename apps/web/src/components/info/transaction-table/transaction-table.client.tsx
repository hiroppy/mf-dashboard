"use client";

import { ListOrdered } from "lucide-react";
import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Pagination } from "../../ui/pagination";
import { useDateFilter } from "../date-filter-context";
import { TransactionDesktopView } from "./transaction-desktop-view";
import { TransactionFilters } from "./transaction-filters";
import { shouldShowTransactionKpiTotals, TransactionKpiSummary } from "./transaction-kpi-summary";
import { TransactionMobileView } from "./transaction-mobile-view";
import type { Transaction } from "./types";
import { useTransactionFiltering } from "./use-transaction-filtering";

function getDateRange(transactions: Transaction[]): { start: string; end: string } | null {
  if (transactions.length === 0) return null;

  let minDate = transactions[0].date;
  let maxDate = transactions[0].date;

  for (const t of transactions) {
    if (t.date < minDate) minDate = t.date;
    if (t.date > maxDate) maxDate = t.date;
  }

  return { start: minDate, end: maxDate };
}

function formatDateRange(range: { start: string; end: string }): string {
  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    return `${year}/${month}/${day}`;
  };

  return `${formatDate(range.start)} 〜 ${formatDate(range.end)}`;
}

interface TransactionTableClientProps {
  transactions: Transaction[];
  pageSize?: number;
  isMonthView?: boolean;
}

export function TransactionTableClient({
  transactions,
  pageSize = 50,
  isMonthView = false,
}: TransactionTableClientProps) {
  const scrollTargetRef = useRef<HTMLDivElement>(null);
  const dateFilter = useDateFilter();
  const selectedDate = dateFilter?.selectedDate ?? null;
  const onDateChange = dateFilter?.onDateChange;

  const dateRange = getDateRange(transactions);

  const {
    searchText,
    selectedCategories,
    selectedTypes,
    selectedAccounts,
    sortColumn,
    sortDirection,
    categories,
    categoryCount,
    accounts,
    accountCount,
    typeOptions,
    paginatedTransactions,
    filteredAndSortedTransactions,
    kpi,
    totalPages,
    currentPage,
    handleSort,
    handleSearchChange,
    handleCategoriesChange,
    handleTypesChange,
    handleAccountsChange,
    handleRemoveCategory,
    handleRemoveType,
    handleRemoveAccount,
    handleClearFilters,
    setCurrentPage,
  } = useTransactionFiltering({
    transactions,
    selectedDate,
    pageSize,
  });
  const showKpiTotals = shouldShowTransactionKpiTotals({
    isMonthView,
    selectedDate,
    searchText,
    selectedCategories,
    selectedTypes,
    selectedAccounts,
  });

  return (
    <Card ref={scrollTargetRef} className="scroll-mt-20">
      <CardHeader
        className="pb-4"
        action={
          !isMonthView && !selectedDate && dateRange ? (
            <span className="text-sm text-muted-foreground">{formatDateRange(dateRange)}</span>
          ) : undefined
        }
      >
        <CardTitle icon={ListOrdered}>詳細一覧</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <TransactionKpiSummary kpi={kpi} showTotals={showKpiTotals} />

        <TransactionFilters
          searchText={searchText}
          selectedCategories={selectedCategories}
          selectedTypes={selectedTypes}
          selectedAccounts={selectedAccounts}
          selectedDate={selectedDate}
          categories={categories}
          categoryCount={categoryCount}
          accounts={accounts}
          accountCount={accountCount}
          typeOptions={typeOptions}
          transactionCount={kpi.count}
          onSearchChange={handleSearchChange}
          onCategoriesChange={handleCategoriesChange}
          onTypesChange={handleTypesChange}
          onAccountsChange={handleAccountsChange}
          onRemoveCategory={handleRemoveCategory}
          onRemoveType={handleRemoveType}
          onRemoveAccount={handleRemoveAccount}
          onRemoveDate={() => onDateChange?.(null)}
          onClearAll={() => handleClearFilters(onDateChange)}
        />

        <TransactionDesktopView
          transactions={paginatedTransactions}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
        />

        <TransactionMobileView transactions={paginatedTransactions} />

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filteredAndSortedTransactions.length}
          onPageChange={setCurrentPage}
          scrollTargetRef={scrollTargetRef}
        />
      </CardContent>
    </Card>
  );
}
