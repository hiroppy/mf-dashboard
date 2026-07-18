import { getExpenseByFixedVariable } from "@mf-dashboard/db";
import { SlidersHorizontal } from "lucide-react";
import { AmountDisplay } from "../ui/amount-display";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

interface FixedVariableBreakdownProps {
  month: string;
  groupId?: string;
}

export async function FixedVariableBreakdown({ month, groupId }: FixedVariableBreakdownProps) {
  const { fixed, variable } = await getExpenseByFixedVariable(month, groupId);
  const total = fixed.total + variable.total;
  const fixedPct = total > 0 ? (fixed.total / total) * 100 : 0;
  const variablePct = total > 0 ? (variable.total / total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={SlidersHorizontal}>固定費 vs 変動費</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {fixedPct > 0 && <div className="bg-expense-fixed" style={{ width: `${fixedPct}%` }} />}
            {variablePct > 0 && (
              <div className="bg-expense-variable" style={{ width: `${variablePct}%` }} />
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-background p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="size-2.5 rounded-sm bg-expense-fixed" />
              <span>固定費</span>
            </div>
            <AmountDisplay
              amount={fixed.total}
              size="sm"
              weight="semibold"
              percentage={fixedPct}
              percentageDecimals={0}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-background p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="size-2.5 rounded-sm bg-expense-variable" />
              <span>変動費</span>
            </div>
            <AmountDisplay
              amount={variable.total}
              size="sm"
              weight="semibold"
              percentage={variablePct}
              percentageDecimals={0}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
