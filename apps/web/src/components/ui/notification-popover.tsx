import Link from "next/link";
import type { MouseEvent } from "react";
import type { BalanceForecastAlert } from "../info/account-notifications-data";
import {
  BANK_FORECAST_ANCHOR_CHANGE_EVENT,
  getBankForecastAnchorId,
} from "../info/bank-cashflow-forecast-anchor";
import { AmountDisplay } from "./amount-display";
import { Badge } from "./badge";

interface Account {
  id: number;
  mfId: string;
  name: string;
  status: string;
}

interface NotificationPopoverProps {
  errorAccounts: Account[];
  updatingAccounts: Account[];
  balanceAlerts: BalanceForecastAlert[];
  onNavigate?: () => void;
}

export function NotificationPopover({
  errorAccounts,
  updatingAccounts,
  balanceAlerts,
  onNavigate,
}: NotificationPopoverProps) {
  const statusIssueCount = errorAccounts.length + updatingAccounts.length;

  function handleBalanceAlertClick(event: MouseEvent<HTMLAnchorElement>) {
    const targetUrl = new URL(event.currentTarget.href);
    const targetPath = targetUrl.pathname.replace(/\/$/, "");
    const currentPath = window.location.pathname.replace(/\/$/, "");
    if (targetPath === currentPath) {
      event.preventDefault();
      window.history.pushState(null, "", targetUrl);
      window.dispatchEvent(new Event(BANK_FORECAST_ANCHOR_CHANGE_EVENT));
    }
    onNavigate?.();
  }

  if (statusIssueCount === 0 && balanceAlerts.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">通知</h3>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-muted-foreground">通知はありません</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-[calc(100dvh-6rem)] space-y-4 overflow-y-auto">
      {balanceAlerts.length > 0 && (
        <section className="space-y-3" aria-labelledby="balance-alert-heading">
          <div className="flex items-center gap-2">
            <h4 id="balance-alert-heading" className="text-sm font-semibold">
              残高注意
            </h4>
            <span className="text-xs text-muted-foreground">({balanceAlerts.length}件)</span>
          </div>
          <div className="space-y-1 pl-2">
            {balanceAlerts.map((alert) => (
              <Link
                key={alert.accountId}
                href={`/cf#${getBankForecastAnchorId(alert.accountId)}`}
                onClick={handleBalanceAlertClick}
                className="block rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
              >
                <span className="block font-medium">{alert.accountName}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  月末予測残高
                  <AmountDisplay
                    amount={alert.forecastBalance}
                    type="balance"
                    size="sm"
                    className="ml-1"
                  />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {statusIssueCount > 0 && (
        <section className="space-y-3" aria-labelledby="status-alert-heading">
          <div className="flex items-center gap-2">
            <h4 id="status-alert-heading" className="text-sm font-semibold">
              更新ステータス
            </h4>
            <span className="text-xs text-muted-foreground">({statusIssueCount}件)</span>
          </div>

          <div className="space-y-3 pl-2">
            {errorAccounts.length > 0 && (
              <div className="space-y-2">
                <Badge variant="destructive">エラー ({errorAccounts.length}件)</Badge>
                <div className="space-y-1 pl-4">
                  {errorAccounts.map((account) => (
                    <Link
                      key={account.id}
                      href={`/accounts/${account.mfId}`}
                      onClick={onNavigate}
                      className="block px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    >
                      {account.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {updatingAccounts.length > 0 && (
              <div className="space-y-2">
                <Badge variant="warning">更新中 ({updatingAccounts.length}件)</Badge>
                <div className="space-y-1 pl-4">
                  {updatingAccounts.map((account) => (
                    <Link
                      key={account.id}
                      href={`/accounts/${account.mfId}`}
                      onClick={onNavigate}
                      className="block px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    >
                      {account.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
