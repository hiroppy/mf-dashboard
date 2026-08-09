"use client";

import { ClipboardCopy } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_INITIAL_DIMENSION } from "../../../lib/chart";
import { formatCurrency } from "../../../lib/format";
import { MetricLabel } from "../../ui/metric-label";
import { Slider } from "../../ui/slider";
import { chartTooltipStyle } from "../chart-tooltip";
import { formatYAxisAmount, type FanChartDataPoint } from "./compound-simulator-utils";

export interface MonteCarloChartProps {
  fanChartData: FanChartDataPoint[];
  currentAge?: number;
  taxFree: boolean;
  withdrawalYears: number;
  contributionYears: number;
  withdrawalStartYear: number;
  totalYears: number;
  inflationRate: number;
  onInflationRateChange: (value: number) => void;
  volatility: number;
  onVolatilityChange: (value: number) => void;
  copyData: unknown;
}

export function MonteCarloChart({
  fanChartData,
  currentAge,
  taxFree,
  withdrawalYears,
  contributionYears,
  withdrawalStartYear,
  totalYears,
  inflationRate,
  onInflationRateChange,
  volatility,
  onVolatilityChange,
  copyData,
}: MonteCarloChartProps) {
  let taxDescription = "";
  if (taxFree) taxDescription = "・非課税";
  else if (withdrawalYears > 0) taxDescription = "・切り崩し税引後";

  return (
    <div className="space-y-4 border-t pt-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-sm font-semibold">モンテカルロ・シミュレーション</h3>
          <p className="text-xs text-muted-foreground">
            5,000通りのランダムなシナリオに基づく将来予測。インフレを差し引いた実質値（今の貨幣価値に換算
            {taxDescription}
            ）で表示しています。
            <br />
            薄い帯が全シナリオの80%、その内側の濃い帯が中央50%を示します（残り20%は帯の外側）
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 md:flex md:items-center md:gap-4">
          <div className="space-y-1 md:w-32">
            <div className="flex items-center justify-between">
              <MetricLabel
                title="インフレ率"
                description="今の100万円が将来いくらの価値になるかに影響します。日本の直近インフレ率は約2〜3%です。名目リターンから差し引いて実質リターンを算出し、グラフは購買力ベース（実質値）で表示されます"
              />
              <span className="text-xs font-semibold text-primary">{inflationRate}%</span>
            </div>
            <Slider
              value={inflationRate}
              onValueChange={onInflationRateChange}
              min={0}
              max={10}
              step={0.5}
              aria-label="インフレ率"
              ticks={[
                { value: 0, label: "0%" },
                { value: 5, label: "5%" },
                { value: 10, label: "10%" },
              ]}
            />
          </div>
          <div className="space-y-1 md:w-40">
            <div className="flex items-center justify-between">
              <MetricLabel
                title="ボラティリティ"
                description={
                  <div className="space-y-1.5">
                    <p>年率の価格変動幅。値が大きいほどリターンのばらつきが大きくなります。</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="pb-1 text-left font-medium">資産クラス</th>
                          <th className="pb-1 text-right font-medium">目安</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        <tr>
                          <td>全世界株式 (MSCI ACWI)</td>
                          <td className="text-right">14〜17%</td>
                        </tr>
                        <tr>
                          <td>先進国株式 (S&amp;P500等)</td>
                          <td className="text-right">15〜19%</td>
                        </tr>
                        <tr>
                          <td>バランス型 (株60/債40)</td>
                          <td className="text-right">8〜11%</td>
                        </tr>
                        <tr>
                          <td>債券中心</td>
                          <td className="text-right">3〜8%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                }
              />
              <span className="text-xs font-semibold text-primary">{volatility}%</span>
            </div>
            <Slider
              value={volatility}
              onValueChange={onVolatilityChange}
              min={5}
              max={30}
              step={1}
              aria-label="ボラティリティ"
              ticks={[
                { value: 5, label: "5%" },
                { value: 10, label: "10%" },
                { value: 20, label: "20%" },
                { value: 30, label: "30%" },
              ]}
            />
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300} initialDimension={CHART_INITIAL_DIMENSION}>
        <ComposedChart data={fanChartData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) =>
              currentAge != null ? `${currentAge + value}歳` : `${value}年`
            }
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatYAxisAmount}
          />
          <Tooltip content={<FanChartTooltip currentAge={currentAge} />} />
          <Area type="monotone" dataKey="base" stackId="fan" fill="transparent" stroke="none" />
          <Area
            type="monotone"
            dataKey="band_outer_lower"
            stackId="fan"
            fill="var(--color-chart-5)"
            fillOpacity={0.12}
            stroke="none"
          />
          <Area
            type="monotone"
            dataKey="band_inner_lower"
            stackId="fan"
            fill="var(--color-chart-5)"
            fillOpacity={0.22}
            stroke="none"
          />
          <Area
            type="monotone"
            dataKey="band_inner_upper"
            stackId="fan"
            fill="var(--color-chart-5)"
            fillOpacity={0.22}
            stroke="none"
          />
          <Area
            type="monotone"
            dataKey="band_outer_upper"
            stackId="fan"
            fill="var(--color-chart-5)"
            fillOpacity={0.12}
            stroke="none"
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke="var(--color-chart-5)"
            strokeWidth={2}
            dot={false}
            name="中央値"
          />
          <Line
            type="monotone"
            dataKey="principal"
            stroke="var(--color-muted-foreground)"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="元本"
          />
          {contributionYears > 0 && contributionYears < withdrawalStartYear && (
            <ReferenceLine
              x={contributionYears}
              stroke="var(--color-muted-foreground)"
              strokeDasharray="4 4"
              label={{
                value:
                  currentAge != null
                    ? `積立終了（${currentAge + contributionYears}歳）`
                    : "積立終了",
                position: "top",
                fontSize: 11,
                fill: "var(--color-muted-foreground)",
              }}
            />
          )}
          {withdrawalYears > 0 && withdrawalStartYear < totalYears && (
            <ReferenceLine
              x={withdrawalStartYear}
              stroke="var(--color-muted-foreground)"
              strokeDasharray="4 4"
              label={{
                value:
                  currentAge != null
                    ? `切り崩し開始（${currentAge + withdrawalStartYear}歳）`
                    : "切り崩し開始",
                position: "top",
                fontSize: 11,
                fill: "var(--color-muted-foreground)",
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex justify-end">
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            void navigator.clipboard.writeText(JSON.stringify(copyData, null, 2));
          }}
          aria-label="設定をJSONでコピー"
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
          設定をコピー
        </button>
      </div>
    </div>
  );
}

function FanChartTooltip({
  active,
  payload,
  label,
  currentAge,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Record<string, number | string | boolean> }>;
  label?: string | number;
  currentAge?: number;
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const rows = [
    { label: "90%タイル", value: data.p90 as number },
    { label: "75%タイル", value: data.p75 as number },
    { label: "中央値", value: data.p50 as number },
    { label: "25%タイル", value: data.p25 as number },
    { label: "10%タイル", value: data.p10 as number },
    { label: "元本", value: data.principal as number },
  ];

  const isContributing = data.isContributing as boolean;
  const isWithdrawing = data.isWithdrawing as boolean;

  let phase = "";
  if (isContributing && isWithdrawing) phase = "・積立+切り崩し";
  else if (isWithdrawing) phase = "・切り崩し";

  let labelText: string;
  if (currentAge != null) {
    labelText = `${currentAge + (label as number)}歳（${label}年後${phase}）`;
  } else {
    labelText = `${label}年後${phase ? `（${phase.slice(1)}）` : ""}`;
  }

  const depletionRate = data.depletionRate as number | undefined;

  return (
    <div style={chartTooltipStyle} className="rounded-md border p-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{labelText}</div>
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4">
          <span className="text-muted-foreground">{row.label}</span>
          <span className="font-medium">{formatCurrency(row.value)}</span>
        </div>
      ))}
      {depletionRate != null && depletionRate > 0 && (
        <div className="mt-1 flex justify-between gap-4 border-t pt-1">
          <span className="text-muted-foreground">枯渇率</span>
          <span className="font-medium text-expense">{(depletionRate * 100).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}
