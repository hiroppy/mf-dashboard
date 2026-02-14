import type { Metadata } from "next";
import { getAccountByMfId, getAllAccountMfIds, isDatabaseAvailable } from "@mf-dashboard/db";
import { mfUrls } from "@mf-dashboard/meta/urls";
import { notFound } from "next/navigation";
import { AccountSummaryCard } from "../../../components/info/account-summary-card";
import { HoldingsTable } from "../../../components/info/holdings-table";
import { TransactionTable } from "../../../components/info/transaction-table/transaction-table";
import { UnrealizedGainCard } from "../../../components/info/unrealized-gain-card";
import { PageLayout } from "../../../components/layout/page-layout";
import { AccountStatusBadge } from "../../../components/ui/account-status-badge";
import { Badge } from "../../../components/ui/badge";
import { formatLastUpdated } from "../../../lib/format";

export async function generateStaticParams() {
  if (!isDatabaseAvailable()) return [{ id: "_" }];
  const mfIds = await getAllAccountMfIds();
  if (mfIds.length === 0) return [{ id: "_" }];
  return mfIds.map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/accounts/[id]">): Promise<Metadata> {
  const { id } = await params;
  const account = await getAccountByMfId(id);
  return {
    title: account?.name ?? "アカウント詳細",
  };
}

export async function AccountDetailContent({ id, groupId }: { id: string; groupId?: string }) {
  const account = await getAccountByMfId(id, groupId);
  if (!account) {
    notFound();
  }

  const showPath = account.type === "手動" ? "show_manual" : "show";
  const mfUrl = mfUrls.accountDetail(account.mfId, showPath);

  return (
    <PageLayout
      title={account.name}
      href={mfUrl}
      options={
        <>
          {account.type !== "手動" && <AccountStatusBadge status={account.status} />}
          <Badge variant="outline">{account.categoryName}</Badge>
          {account.type !== "手動" && formatLastUpdated(account.lastUpdated, true) && (
            <span className="text-sm text-muted-foreground">
              最終更新: {formatLastUpdated(account.lastUpdated, true)}
            </span>
          )}
        </>
      }
    >
      {account.errorMessage && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
          {account.errorMessage}
        </div>
      )}

      <AccountSummaryCard mfId={id} groupId={groupId} />
      <UnrealizedGainCard mfId={id} groupId={groupId} />
      <HoldingsTable mfId={id} type="asset" groupId={groupId} />
      <HoldingsTable mfId={id} type="liability" groupId={groupId} />
      <TransactionTable mfId={id} groupId={groupId} />
    </PageLayout>
  );
}

export default async function AccountDetailPage({ params }: PageProps<"/accounts/[id]">) {
  const { id } = await params;
  return <AccountDetailContent id={id} />;
}
