import { formatCurrency } from "../../../lib/format";
import { MetricLabel } from "../../ui/metric-label";
import { getSecurityLabel, type SecurityLevel } from "./compound-simulator-utils";
import type { SensitivityRow } from "./simulate-monte-carlo";

const levelStyles: Record<SecurityLevel, string> = {
  safe: "text-balance-positive",
  caution: "text-amber-800 dark:text-amber-300",
  warning: "text-amber-800 dark:text-amber-300",
  danger: "text-expense",
};

const SAFE_THRESHOLD = 80;

interface SecurityScoreProps {
  score: number;
  currentMonthly: number;
  currentRate?: number;
  sensitivityRows: SensitivityRow[];
  onApplyMonthly?: (amount: number) => void;
  onApplyRate?: (rate: number) => void;
}

export function SecurityScore({
  score,
  currentMonthly,
  currentRate,
  sensitivityRows,
  onApplyMonthly,
  onApplyRate,
}: SecurityScoreProps) {
  const { label, level } = getSecurityLabel(score);
  const colorClass = levelStyles[level];

  const isRateMode = sensitivityRows.length > 0 && sensitivityRows[0].withdrawalRate != null;

  // Find the best suggestion to reach SAFE_THRESHOLD
  const safeRow =
    score < SAFE_THRESHOLD
      ? isRateMode
        ? sensitivityRows.find(
            (r) =>
              r.securityScore >= SAFE_THRESHOLD &&
              r.withdrawalRate != null &&
              r.withdrawalRate < (currentRate ?? 0),
          )
        : sensitivityRows.find(
            (r) => r.securityScore >= SAFE_THRESHOLD && r.monthlyContribution > currentMonthly,
          )
      : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`text-3xl font-bold tabular-nums ${colorClass}`}>{score}</span>
        <div>
          <div className={`text-sm font-semibold ${colorClass}`}>{label}</div>
          <MetricLabel
            title="安心度スコア(0〜100)"
            description={
              <div className="space-y-1.5">
                <p>5,000回モンテカルロ・シミュレーションに基づくスコア。</p>
                <p className="font-medium">計算方法</p>
                <ul className="list-disc space-y-0.5 pl-3">
                  <li>ベース: (1 - 枯渇確率) x 100</li>
                  <li>元本割れ確率が高いほど減点(最大-20pt)</li>
                  <li>中央値が0(半数以上で枯渇)の場合、上限10に制限</li>
                </ul>
                <p>
                  この感度分析テーブルでは、
                  {isRateMode
                    ? "引出率を変えた場合の安心度の変化"
                    : "積立額を変えた場合の安心度の変化"}
                  を確認できます。
                </p>
              </div>
            }
          />
        </div>
        {score < SAFE_THRESHOLD && sensitivityRows.length > 0 && (
          <div className="w-full sm:w-auto sm:ml-auto">
            {safeRow ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {isRateMode && safeRow.withdrawalRate != null
                    ? `引出率を${safeRow.withdrawalRate}%に下げると安心`
                    : `あと+${formatCurrency(safeRow.monthlyContribution - currentMonthly)}/月`}
                </span>
                {isRateMode && safeRow.withdrawalRate != null && onApplyRate ? (
                  <button
                    type="button"
                    onClick={() => onApplyRate(safeRow.withdrawalRate!)}
                    className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {safeRow.withdrawalRate}%に変更
                  </button>
                ) : !isRateMode && onApplyMonthly ? (
                  <button
                    type="button"
                    onClick={() => onApplyMonthly(safeRow.monthlyContribution)}
                    className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    月{formatCurrency(safeRow.monthlyContribution)}に変更
                  </button>
                ) : null}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {isRateMode
                  ? "引出率の大幅な引き下げが必要です"
                  : "積立額の大幅な増額または生活費の見直しが必要です"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
