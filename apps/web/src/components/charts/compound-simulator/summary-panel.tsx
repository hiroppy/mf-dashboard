import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { formatCurrency } from "../../../lib/format";
import { MetricLabel } from "../../ui/metric-label";
import { Tooltip as UiTooltip } from "../../ui/tooltip";
import type { YearlyProjection } from "./calculate-compound";
import type { DrawdownPercentile } from "./compound-simulator-types";
import { SecurityScore } from "./security-score";
import { SensitivityTable } from "./sensitivity-table";
import type { MonteCarloResult, SensitivityRow } from "./simulate-monte-carlo";
import { TimelinePhaseChips } from "./timeline";

export interface SummaryPanelProps {
  withdrawalYears: number;
  contributionYears: number;
  withdrawalStartYear: number;
  currentYear: number;
  currentAge?: number;
  taxFree: boolean;
  contributionEnd?: YearlyProjection;
  securityScore: number;
  monthlyContribution: number;
  withdrawalRate: number;
  sensitivityRows: SensitivityRow[];
  sensitivityTableRows: SensitivityRow[];
  onApplyMonthly: (amount: number) => void;
  onApplyRate: (rate: number) => void;
  drawdownPercentile: DrawdownPercentile;
  onDrawdownPercentileChange: (value: DrawdownPercentile) => void;
  mcDrawdownEndValue?: number;
  totalWithdrawalAmount: number;
  monteCarlo: MonteCarloResult;
  summary: ReactNode | null;
}

export function SummaryPanel({
  withdrawalYears,
  contributionYears,
  withdrawalStartYear,
  currentYear,
  currentAge,
  taxFree,
  contributionEnd,
  securityScore,
  monthlyContribution,
  withdrawalRate,
  sensitivityRows,
  sensitivityTableRows,
  onApplyMonthly,
  onApplyRate,
  drawdownPercentile,
  onDrawdownPercentileChange,
  mcDrawdownEndValue,
  totalWithdrawalAmount,
  monteCarlo,
  summary,
}: SummaryPanelProps) {
  return (
    <>
      <div className="rounded-lg bg-muted/50 p-4 space-y-4">
        {withdrawalYears > 0 && (
          <SecurityScore
            score={securityScore}
            currentMonthly={monthlyContribution}
            currentRate={withdrawalRate}
            sensitivityRows={sensitivityRows}
            onApplyMonthly={onApplyMonthly}
            onApplyRate={onApplyRate}
          />
        )}
        {withdrawalYears > 0 && (
          <SensitivityTable
            rows={sensitivityTableRows}
            currentMonthly={monthlyContribution}
            currentRate={withdrawalRate}
          />
        )}
        <TimelinePhaseChips
          contributionYears={contributionYears}
          withdrawalStartYear={withdrawalStartYear}
          withdrawalYears={withdrawalYears}
          currentYear={currentYear}
          currentAge={currentAge}
        />

        <div className={`grid gap-4 grid-cols-2 ${taxFree ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
          <div>
            <MetricLabel title="元本合計" description="初期投資額 + 月額積立額の合計" />
            <div className="text-lg font-semibold">
              {formatCurrency(contributionEnd?.principal ?? 0)}
            </div>
          </div>
          <div>
            <MetricLabel
              title={taxFree ? "運用益" : "運用益（税引後）"}
              description={
                taxFree
                  ? "複利で得られる利益（非課税）"
                  : "複利で得られる利益から税金を差し引いた額"
              }
            />
            <div className="text-lg font-semibold text-balance-positive">
              {formatCurrency(contributionEnd?.interest ?? 0)}
            </div>
          </div>
          {!taxFree && (
            <div>
              <MetricLabel
                title="税金"
                description={
                  <>
                    運用益 × 20.315%
                    <br />
                    （所得税15.315% + 住民税5%）
                  </>
                }
              />
              <div className="text-lg font-semibold text-expense">
                {formatCurrency(contributionEnd?.tax ?? 0)}
              </div>
            </div>
          )}
          <div>
            <MetricLabel
              title={taxFree ? "合計" : "手取り合計"}
              description={taxFree ? "元本合計 + 運用益" : "元本合計 + 運用益（税引後）"}
            />
            <div className="text-lg font-semibold">
              {formatCurrency(contributionEnd?.total ?? 0)}
            </div>
          </div>
        </div>

        {withdrawalYears > 0 && (
          <>
            <div className="border-t pt-4" />
            <PercentileSelector value={drawdownPercentile} onChange={onDrawdownPercentileChange} />
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <MetricLabel
                  title="切り崩し後の残額"
                  description="5,000回モンテカルロ・シミュレーションの結果。選択したパーセンタイルに応じた残額を表示します"
                />
                <div className="text-lg font-semibold">
                  {formatCurrency(mcDrawdownEndValue ?? 0)}
                </div>
              </div>
              <div>
                <MetricLabel
                  title="総引出額"
                  description="各年の引出額の合計（税引前の手取り額）"
                />
                <div className="text-lg font-semibold text-expense">
                  {formatCurrency(totalWithdrawalAmount)}
                </div>
              </div>
              <div>
                <MetricLabel
                  title="元本割れ確率"
                  description="投資した元本を回収できない確率。5,000回シミュレーションのうち、残額と累計引出額の合計が投入元本を下回ったシナリオの割合"
                />
                <div
                  className={`text-lg font-semibold ${
                    monteCarlo.failureProbability > 0.2
                      ? "text-expense"
                      : monteCarlo.failureProbability > 0.05
                        ? "text-amber-800"
                        : "text-balance-positive"
                  }`}
                >
                  {(monteCarlo.failureProbability * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <MetricLabel
                  title="枯渇確率"
                  description={
                    <div className="space-y-1.5">
                      <p>
                        資金が完全にゼロになる確率。5,000回シミュレーションのうち、切り崩し期間中に資金がゼロになったシナリオの割合。
                      </p>
                      <p className="font-medium">枯渇リスクが高まる要因</p>
                      <ul className="list-disc space-y-0.5 pl-3">
                        {!taxFree && <li>手取り額に加え課税分が追加で引かれ、実引出率が上昇</li>}
                        <li>
                          実質リターン = 名目リターン − インフレ率 − σ²/2
                          のため、見た目の利回りより低い
                        </li>
                        <li>引出率が実質リターンを上回ると元本が目減り</li>
                        <li>30年超の長期では下落の影響が累積</li>
                      </ul>
                      <p className="text-muted-foreground">
                        4%ルールは米国株式中心・30年・税引前が前提です
                      </p>
                    </div>
                  }
                />
                <div
                  className={`text-lg font-semibold ${
                    monteCarlo.depletionProbability > 0.2
                      ? "text-expense"
                      : monteCarlo.depletionProbability > 0.05
                        ? "text-amber-800"
                        : "text-balance-positive"
                  }`}
                >
                  {(monteCarlo.depletionProbability * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            {monteCarlo.distribution.length > 1 && (
              <DistributionBars
                distribution={monteCarlo.distribution}
                selectedValue={mcDrawdownEndValue ?? 0}
              />
            )}
          </>
        )}
      </div>

      {summary && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">{summary}</div>
      )}
    </>
  );
}

function PercentileSelector({
  value,
  onChange,
}: {
  value: DrawdownPercentile;
  onChange: (value: DrawdownPercentile) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <span className="mr-1 text-xs text-muted-foreground">悲観</span>
      {(["p10", "p25", "p50", "p75", "p90"] as const).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`px-2 py-0.5 text-xs rounded transition-colors ${
            value === p
              ? "bg-primary text-primary-foreground"
              : "bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20"
          }`}
        >
          {p}
        </button>
      ))}
      <span className="ml-1 text-xs text-muted-foreground">楽観</span>
      <UiTooltip
        content="p50（中央値）は半数のシナリオがこの値以上になることを意味します。p10は最悪に近いケース、p90は最良に近いケースです"
        aria-label="パーセンタイルの説明"
      >
        <CircleHelp className="ml-1 h-3.5 w-3.5 text-muted-foreground/60" />
      </UiTooltip>
    </div>
  );
}

function DistributionBars({
  distribution,
  selectedValue,
}: {
  distribution: MonteCarloResult["distribution"];
  selectedValue: number;
}) {
  const bins = distribution.filter((b) => b.count > 0);
  const maxCount = Math.max(...bins.map((b) => b.count));
  const activeBinIdx = findActiveDistributionBin(bins, selectedValue);

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        シミュレーション終了時の資産分布（5,000パス）
      </p>
      <div key={distribution.map((b) => b.count).join(",")} className="space-y-0.5">
        {bins.map((bin, i) => {
          const pct = (bin.count / 5000) * 100;
          const isActive = i === activeBinIdx;
          const isLastBin = !bin.isDepleted && i === bins.length - 1;
          const label = bin.isDepleted
            ? "0円(枯渇)"
            : isLastBin
              ? `${formatBin(bin.rangeEnd)}〜`
              : `〜${formatBin(bin.rangeEnd)}`;
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className={`w-20 shrink-0 text-right tabular-nums ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </span>
              <div className="h-3.5 flex-1 overflow-hidden rounded-sm bg-muted/30">
                <div
                  className={`h-full origin-left rounded-sm ${
                    bin.isDepleted ? "bg-destructive" : isActive ? "bg-primary" : "bg-primary/40"
                  }`}
                  style={{
                    width: `${maxCount > 0 ? (bin.count / maxCount) * 100 : 0}%`,
                    animation: `grow-bar 0.6s ease-out ${i * 40}ms both`,
                  }}
                />
              </div>
              <span
                className={`w-10 shrink-0 text-right tabular-nums ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                {pct >= 1 ? `${pct.toFixed(0)}%` : pct > 0 ? "<1%" : "0%"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function findActiveDistributionBin(
  bins: MonteCarloResult["distribution"],
  selectedValue: number,
): number {
  for (let idx = 0; idx < bins.length; idx++) {
    const bin = bins[idx];
    if (bin.isDepleted && selectedValue <= 0) return idx;
    if (!bin.isDepleted) {
      const prevEnd = idx > 0 && !bins[idx - 1].isDepleted ? bins[idx - 1].rangeEnd : 0;
      if (selectedValue > prevEnd && selectedValue <= bin.rangeEnd) return idx;
    }
  }
  return bins.length > 0 ? bins.length - 1 : -1;
}

function formatBin(value: number): string {
  return value >= 100_000_000
    ? `${(value / 100_000_000).toFixed(1)}億`
    : `${Math.round(value / 10_000).toLocaleString("ja-JP")}万`;
}
