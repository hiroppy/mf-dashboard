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
      <CardContent className="space-y-6">
        {/* Bar visualization */}
        <div className="space-y-2">
          <div className="flex h-8 rounded-lg overflow-hidden">
            {fixedPct > 0 && <div className="bg-expense-fixed" style={{ width: `${fixedPct}%` }} />}
            {variablePct > 0 && (
              <div className="bg-expense-variable" style={{ width: `${variablePct}%` }} />
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Fixed expenses */}
          <div>
            <div className="font-medium text-sm mb-2 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-expense-fixed" />
              <div className="flex items-center justify-between w-full">
                <span>固定費</span>
                <AmountDisplay
                  amount={fixed.total}
                  size="sm"
                  percentage={fixedPct}
                  percentageDecimals={0}
                />
              </div>
            </div>
            {fixed.categories.length > 0 ? (
              <ul className="space-y-1">
                {fixed.categories.map((item) => (
                  <li key={item.category} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.category}</span>
                    <AmountDisplay amount={item.amount} size="sm" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">データなし</p>
            )}
          </div>

          {/* Variable expenses */}
          <div>
            <div className="font-medium text-sm mb-2 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-expense-variable" />
              <div className="flex items-center justify-between w-full">
                <span>変動費</span>
                <AmountDisplay
                  amount={variable.total}
                  size="sm"
                  percentage={variablePct}
                  percentageDecimals={0}
                />
              </div>
            </div>

            {variable.categories.length > 0 ? (
              <ul className="space-y-1">
                {variable.categories.slice(0, 10).map((item) => (
                  <li key={item.category} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.category}</span>
                    <AmountDisplay amount={item.amount} size="sm" />
                  </li>
                ))}
                {variable.categories.length > 10 && (
                  <li className="text-sm text-muted-foreground">
                    他 {variable.categories.length - 10} カテゴリ
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">データなし</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
