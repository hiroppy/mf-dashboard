import type { Metadata } from "next";
import { getAccountsGroupedByCategory } from "@mf-dashboard/db";
import { mfUrls } from "@mf-dashboard/meta/urls";
import { AccountCard } from "../../components/info/account-card";
import { PageLayout } from "../../components/layout/page-layout";
import { Badge } from "../../components/ui/badge";

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
    status: string;
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

function AccountList({
  groupedAccounts,
  groupId,
}: {
  groupedAccounts: GroupedAccounts[];
  groupId?: string;
}) {
  if (groupedAccounts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">連携サービスがありません。</div>
    );
  }

  return (
    <div className="space-y-8">
      {groupedAccounts.map((group) => (
        <div key={group.categoryName} className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground border-b pb-2">
            {group.categoryName}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.accounts.map((account) => (
              <AccountCard
                key={account.id}
                mfId={account.mfId}
                name={account.name}
                type={account.type}
                status={account.status}
                lastUpdated={account.lastUpdated}
                totalAssets={account.totalAssets}
                groupId={groupId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
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
      <AccountList groupedAccounts={groupedAccounts} groupId={groupId} />
    </PageLayout>
  );
}

export default function AccountsPage() {
  return <AccountsContent />;
}
