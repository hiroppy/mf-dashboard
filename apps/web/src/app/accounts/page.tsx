import { getAccountsGroupedByCategory } from "@mf-dashboard/db";
import type { AccountStatusType } from "@mf-dashboard/db/types";
import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Metadata } from "next";
import { PageLayout } from "../../components/layout/page-layout";
import { Badge } from "../../components/ui/badge";
import { AccountListClient } from "./account-list.client";

export const metadata: Metadata = {
  title: "連携サービス一覧",
};

interface GroupedAccounts {
  categoryName: string;
  accounts: {
    id: number;
    mfId: string;
    name: string;
    type: string;
    status: AccountStatusType;
    lastUpdated: string | null;
    totalAssets: number;
  }[];
}

function AccountStatusBadges({ groupedAccounts }: { groupedAccounts: GroupedAccounts[] }) {
  // 自動連携のみカウント（手動はステータス不明のため除外）
  const allAccounts = groupedAccounts.flatMap((group) => group.accounts);
  const autoAccounts = allAccounts.filter((a) => a.type !== "手動");
  const okCount = autoAccounts.filter((a) => a.status === "ok").length;
  const errorCount = autoAccounts.filter((a) => a.status === "error").length;

  return (
    <>
      <Badge variant="success">正常: {okCount}件</Badge>
      <Badge variant="destructive">エラー: {errorCount}件</Badge>
    </>
  );
}

export async function AccountsContent({ groupId }: { groupId?: string }) {
  const groupedAccounts = await getAccountsGroupedByCategory(groupId);

  return (
    <PageLayout
      title="連携サービス一覧"
      href={mfUrls.accounts}
      options={<AccountStatusBadges groupedAccounts={groupedAccounts} />}
    >
      <AccountListClient groupedAccounts={groupedAccounts} groupId={groupId} />
    </PageLayout>
  );
}

export default function AccountsPage() {
  return <AccountsContent />;
}
