import type { Metadata } from "next";
import {
  getAvailableMonths,
  getMonthlySummaryByMonth,
  isDatabaseAvailable,
} from "@moneyforward-daily-action/db";
import { mfUrls } from "@moneyforward-daily-action/meta/urls";
import { notFound } from "next/navigation";
import { CategoryBreakdown } from "../../../components/info/category-breakdown/category-breakdown";
import { DailySpendingHeatmap } from "../../../components/info/daily-spending-heatmap";
import { DateFilterProvider } from "../../../components/info/date-filter-context";
import { FixedVariableBreakdown } from "../../../components/info/fixed-variable-breakdown";
import { SankeyDiagram } from "../../../components/info/sankey-diagram";
import { TransactionTable } from "../../../components/info/transaction-table/transaction-table";
import { MonthSelector } from "../../../components/layout/month-selector";
import { PageLayout } from "../../../components/layout/page-layout";
import { formatMonth } from "../../../lib/format";

export async function generateStaticParams() {
  if (!isDatabaseAvailable()) return [{ month: "_" }];
  const months = getAvailableMonths();
  if (months.length === 0) return [{ month: "_" }];
  return months.map(({ month }) => ({ month }));
}

export async function generateMetadata({ params }: PageProps<"/cf/[month]">): Promise<Metadata> {
  const { month } = await params;
  return {
    title: `収支 - ${formatMonth(month)}`,
  };
}

export function CFMonthContent({ month, groupId }: { month: string; groupId?: string }) {
  const summary = getMonthlySummaryByMonth(month, groupId);

  if (!summary) {
    notFound();
  }

  const basePath = groupId ? `/${groupId}/cf` : "/cf";

  return (
    <PageLayout
      title={`収支 - ${formatMonth(month)}`}
      href={mfUrls.cashFlow}
      options={<MonthSelector currentMonth={month} basePath={basePath} groupId={groupId} />}
    >
      <SankeyDiagram month={month} groupId={groupId} />

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        <CategoryBreakdown month={month} type="income" groupId={groupId} />
        <CategoryBreakdown month={month} type="expense" groupId={groupId} />
      </div>

      <DateFilterProvider>
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
          <FixedVariableBreakdown month={month} groupId={groupId} />
          <DailySpendingHeatmap month={month} groupId={groupId} />
        </div>

        <TransactionTable month={month} groupId={groupId} />
      </DateFilterProvider>
    </PageLayout>
  );
}

export default async function PLMonthPage({ params }: PageProps<"/cf/[month]">) {
  const { month } = await params;
  return <CFMonthContent month={month} />;
}
