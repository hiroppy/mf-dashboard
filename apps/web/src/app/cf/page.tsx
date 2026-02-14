import type { Metadata } from "next";
import { getMonthlySummaries } from "@mf-dashboard/db";
import { mfUrls } from "@mf-dashboard/meta/urls";
import { Suspense } from "react";
import { MonthlyIncomeExpenseChart } from "../../components/info/monthly-income-expense-chart";
import { MonthlySummaryCard } from "../../components/info/monthly-summary-card";
import { TransactionStats } from "../../components/info/transaction-stats";
import { TransactionTable } from "../../components/info/transaction-table/transaction-table";
import { PageLayout } from "../../components/layout/page-layout";
import { AmountDisplay } from "../../components/ui/amount-display";
import { CFTabProvider, CFTabSelector, CFTabContent } from "./_components/cf-tabs";

export const metadata: Metadata = {
  title: "収支",
};

export async function CFContent({ groupId }: { groupId?: string }) {
  const monthlySummaries = await getMonthlySummaries({ groupId });

  // Group summaries by year
  const summariesByYear = monthlySummaries.reduce(
    (acc, summary) => {
      const year = summary.month.substring(0, 4);
      if (!acc[year]) {
        acc[year] = [];
      }
      acc[year].push(summary);
      return acc;
    },
    {} as Record<string, typeof monthlySummaries>,
  );

  // Build href with groupId prefix
  const cfPath = groupId ? `/${groupId}/cf` : "/cf";

  const summaryContent = (
    <>
      {/* Monthly chart */}
      <MonthlyIncomeExpenseChart groupId={groupId} />

      {/* Monthly summaries list by year */}
      {Object.entries(summariesByYear)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([year, summaries]) => {
          const yearIncome = summaries.reduce((sum, s) => sum + s.totalIncome, 0);
          const yearExpense = summaries.reduce((sum, s) => sum + s.totalExpense, 0);
          const yearBalance = yearIncome - yearExpense;

          return (
            <div key={year} className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">{year}年</h2>

              {/* Year cumulative summary */}
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-sm text-muted-foreground">累計収入</p>
                  <p className="mt-1">
                    <AmountDisplay amount={yearIncome} type="income" size="2xl" weight="bold" />
                  </p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-sm text-muted-foreground">累計支出</p>
                  <p className="mt-1">
                    <AmountDisplay amount={yearExpense} type="expense" size="2xl" weight="bold" />
                  </p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-sm text-muted-foreground">累計収支</p>
                  <p className="mt-1">
                    <AmountDisplay amount={yearBalance} type="balance" size="2xl" weight="bold" />
                  </p>
                </div>
              </div>

              {/* Category breakdown for the year */}
              <TransactionStats year={year} groupId={groupId} />

              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {summaries.map((summary) => (
                  <MonthlySummaryCard
                    key={summary.month}
                    month={summary.month}
                    totalIncome={summary.totalIncome}
                    totalExpense={summary.totalExpense}
                    href={`${cfPath}/${summary.month}/`}
                  />
                ))}
              </div>
            </div>
          );
        })}
    </>
  );

  const transactionsContent = <TransactionTable groupId={groupId} />;

  return (
    <Suspense>
      <CFTabProvider>
        <PageLayout title="収支" href={mfUrls.cashFlow} options={<CFTabSelector />}>
          <CFTabContent summaryContent={summaryContent} transactionsContent={transactionsContent} />
        </PageLayout>
      </CFTabProvider>
    </Suspense>
  );
}

export default function PLPage() {
  return <CFContent />;
}
