import type { AccountStatusType } from "@mf-dashboard/db/types";
import { formatLastUpdated } from "../../lib/format";
import { AccountStatusBadge } from "../ui/account-status-badge";
import { AmountDisplay } from "../ui/amount-display";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";

type AccountCardProps = {
  mfId: string;
  name: string;
  type: string;
  status: AccountStatusType;
  lastUpdated: string | null;
  totalAssets: number;
  groupId?: string;
};

export function AccountCard({
  mfId,
  name,
  type,
  status,
  lastUpdated,
  totalAssets,
  groupId,
}: AccountCardProps) {
  const basePath = groupId ? `/${groupId}/accounts` : "/accounts";
  const href = `${basePath}/${mfId}`;
  const isLinkable = mfId !== "unknown";

  return (
    <Card
      href={isLinkable ? href : undefined}
      className={isLinkable ? "border-primary/30 hover:border-primary transition-colors" : ""}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <span className="font-semibold text-foreground">{name}</span>
          <Badge variant="outline">{type}</Badge>
        </div>

        <div className="mb-3">
          <AmountDisplay amount={totalAssets} size="2xl" weight="bold" />
        </div>

        <div className="flex items-center justify-between h-5">
          <div className="flex items-center gap-2">
            {type !== "手動" && <AccountStatusBadge status={status} />}
          </div>
          {type !== "手動" && formatLastUpdated(lastUpdated) && (
            <span className="text-sm text-muted-foreground">
              取得日時: {formatLastUpdated(lastUpdated)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
