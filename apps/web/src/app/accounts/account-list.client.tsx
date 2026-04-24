"use client";

import type { getAccountsGroupedByCategory } from "@mf-dashboard/db";
import { useState } from "react";
import { AccountCard } from "../../components/info/account-card";
import { Switch } from "../../components/ui/switch";

type GroupedAccounts = Awaited<ReturnType<typeof getAccountsGroupedByCategory>>;

interface AccountListClientProps {
  groupedAccounts: GroupedAccounts;
  groupId?: string;
}

export function countSuspended(groupedAccounts: GroupedAccounts): number {
  return groupedAccounts.flatMap((g) => g.accounts).filter((a) => a.status === "suspended").length;
}

export function filterSuspended(groupedAccounts: GroupedAccounts): GroupedAccounts {
  return groupedAccounts
    .map((group) => ({
      ...group,
      accounts: group.accounts.filter((a) => a.status !== "suspended"),
    }))
    .filter((group) => group.accounts.length > 0);
}

export function AccountListClient({ groupedAccounts, groupId }: AccountListClientProps) {
  const [showSuspended, setShowSuspended] = useState(false);

  const suspendedCount = countSuspended(groupedAccounts);
  const filteredGroups = showSuspended ? groupedAccounts : filterSuspended(groupedAccounts);

  return (
    <div className="space-y-6">
      {suspendedCount > 0 && (
        <div className="flex items-center gap-2">
          <Switch
            id="show-suspended"
            checked={showSuspended}
            onCheckedChange={setShowSuspended}
            aria-label="停止中のアカウントを表示する"
          />
          <label htmlFor="show-suspended" className="text-sm text-muted-foreground cursor-pointer">
            停止中を表示する（{suspendedCount}件）
          </label>
        </div>
      )}

      {filteredGroups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">連携サービスがありません。</div>
      ) : (
        <div className="space-y-8">
          {filteredGroups.map((group) => (
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
      )}
    </div>
  );
}
