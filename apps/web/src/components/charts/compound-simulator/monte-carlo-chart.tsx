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
  copyData: unknown;
}

const LEGEND_ITEMS = [
  {
    label: "中央値",
    markerClassName: "h-0.5 w-5 bg-[var(--color-chart-5)]",
  },
  {
    label: "半数のケースが入る範囲",
    markerClassName: "h-3 w-5 rounded-sm bg-[var(--color-chart-5)] opacity-25",
  },
  {
    label: "薄い帯を含む8割のケースが入る範囲",
    markerClassName: "h-3 w-5 rounded-sm bg-[var(--color-chart-5)] opacity-10",
  },
  {
    label: "投入元本",
    markerClassName: "w-5 border-t border-dashed border-muted-foreground",
  },
] as const;

export function MonteCarloChart({
  fanChartData,
  currentAge,
  taxFree,
  withdrawalYears,
  contributionYears,
  withdrawalStartYear,
  totalYears,
  copyData,
}: MonteCarloChartProps) {
  let taxDescription = "";
  if (taxFree) taxDescription = "・非課税";
  else if (withdrawalYears > 0) taxDescription = "・切り崩し税引後";

  return (
    <div className="space-y-4 border-t pt-6">
      <div>
        <h3 className="text-sm font-semibold">モンテカルロ・シミュレーション</h3>
        <p className="text-xs text-muted-foreground">
          5,000通りのランダムなシナリオに基づく将来予測。インフレを差し引いた実質値（今の貨幣価値に換算
          {taxDescription}
          ）で表示しています。
        </p>
        <div
          className="flex flex-wrap gap-x-4 text-xs text-muted-foreground"
          aria-label="グラフの凡例"
        >
          {LEGEND_ITEMS.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5">
              <span className={item.markerClassName} aria-hidden="true" />
              {item.label}
            </span>
          ))}
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
              strokeDasharray="2 2"
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
              strokeDasharray="2 2"
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
    { label: "中央値", value: data.p50 as number, emphasized: true },
    { label: "上振れケース（上位10%）", value: data.p90 as number },
    { label: "下振れケース（下位10%）", value: data.p10 as number },
    { label: "投入元本", value: data.principal as number },
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
          <span className={row.emphasized ? "font-semibold" : "font-medium"}>
            {formatCurrency(row.value)}
          </span>
        </div>
      ))}
      {isWithdrawing && (
        <div className="mt-1 flex justify-between gap-4 border-t pt-1">
          <span className="text-muted-foreground">枯渇率</span>
          <span className="font-medium text-expense">
            {((depletionRate ?? 0) * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
