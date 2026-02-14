import { getAccountsWithAssets } from "@mf-dashboard/db";
import { AccountNotificationsClient } from "./account-notifications.client";

export async function AccountNotifications() {
  const accounts = await getAccountsWithAssets();
  const errorAccounts = accounts.filter((a) => a.status === "error");
  const updatingAccounts = accounts.filter((a) => a.status === "updating");
  const totalIssues = errorAccounts.length + updatingAccounts.length;

  return (
    <AccountNotificationsClient
      errorAccounts={errorAccounts}
      updatingAccounts={updatingAccounts}
      totalIssues={totalIssues}
    />
  );
}
