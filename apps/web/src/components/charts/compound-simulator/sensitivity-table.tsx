import { formatCurrency } from "../../../lib/format";
import { getSecurityLabel, type SecurityLevel } from "./compound-simulator-utils";
import type { SensitivityRow } from "./simulate-monte-carlo";

const levelStyles: Record<SecurityLevel, string> = {
  safe: "text-balance-positive",
  caution: "text-amber-800 dark:text-amber-300",
  warning: "text-amber-800 dark:text-amber-300",
  danger: "text-expense",
};

interface SensitivityTableProps {
  rows: SensitivityRow[];
  currentMonthly: number;
  currentRate?: number;
}

export function SensitivityTable({ rows, currentMonthly, currentRate }: SensitivityTableProps) {
  if (rows.length === 0) return null;

  const isRateMode = rows[0].withdrawalRate != null;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "35%" }} />
            <col style={{ width: "30%" }} />
            <col style={{ width: "35%" }} />
          </colgroup>
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="pb-1.5 text-left font-medium">{isRateMode ? "引出率" : "月額積立"}</th>
              <th className="pb-1.5 text-right font-medium">安心度</th>
              <th className="pb-1.5 text-right font-medium">中央値残高</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((row) => {
              const isCurrent = isRateMode
                ? row.withdrawalRate === currentRate
                : row.monthlyContribution === currentMonthly;
              const { label, level } = getSecurityLabel(row.securityScore);
              return (
                <tr
                  key={isRateMode ? row.withdrawalRate : row.monthlyContribution}
                  className={isCurrent ? "bg-primary/5 font-semibold" : ""}
                >
                  <td className="py-1">
                    {isRateMode
                      ? `${row.withdrawalRate}%`
                      : formatCurrency(row.monthlyContribution)}
                    {isCurrent && (
                      <span className="ml-1 text-xs text-muted-foreground font-normal">(現在)</span>
                    )}
                  </td>
                  <td className={`py-1 text-right whitespace-nowrap ${levelStyles[level]}`}>
                    <span className="inline-block w-10 text-right">{row.securityScore}%</span>
                    <span className="ml-1 text-xs">{label}</span>
                  </td>
                  <td className="py-1 text-right">{formatCurrency(row.medianFinalBalance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
