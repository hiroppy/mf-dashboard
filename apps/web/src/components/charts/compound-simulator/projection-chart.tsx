"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_INITIAL_DIMENSION } from "../../../lib/chart";
import { formatCurrency } from "../../../lib/format";
import { chartTooltipStyle } from "../chart-tooltip";
import type { YearlyProjection } from "./calculate-compound";
import { getLabelMap } from "./compound-simulator-utils";

export interface ProjectionChartProps {
  projections: YearlyProjection[];
  taxFree: boolean;
  currentAge?: number;
  contributionYears: number;
  withdrawalStartYear: number;
  withdrawalYears: number;
  totalYears: number;
  milestones: number[];
  currentTotalAssets?: number;
}

export function ProjectionChart({
  projections,
  taxFree,
  currentAge,
  contributionYears,
  withdrawalStartYear,
  withdrawalYears,
  totalYears,
  milestones,
  currentTotalAssets,
}: ProjectionChartProps) {
  const labelMap = getLabelMap(taxFree);

  return (
    <>
      <ResponsiveContainer width="100%" height={300} initialDimension={CHART_INITIAL_DIMENSION}>
        <ComposedChart data={projections} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
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
            tickFormatter={(value) => `${(value / 10000).toFixed(0)}万`}
          />
          <Tooltip
            formatter={(value, name) => [
              formatCurrency(value as number),
              labelMap[name as string] ?? name,
            ]}
            labelFormatter={(label) => {
              const entry = projections.find((p) => p.year === label);
              let phase = "";
              if (entry?.isContributing && entry?.isWithdrawing) phase = "・積立+切り崩し";
              else if (entry?.isWithdrawing) phase = "・切り崩し";
              if (currentAge != null)
                return `${currentAge + (label as number)}歳（${label}年後${phase}）`;
              return `${label}年後${phase ? `（${phase.slice(1)}）` : ""}`;
            }}
            contentStyle={chartTooltipStyle}
          />
          <Legend formatter={(value) => labelMap[value] ?? value} />
          <Area
            type="monotone"
            dataKey="principal"
            stackId="1"
            stroke="var(--color-chart-1)"
            fill="color-mix(in oklch, var(--color-chart-1) 30%, transparent)"
            name="principal"
          />
          <Area
            type="monotone"
            dataKey="interest"
            stackId="1"
            stroke="var(--color-chart-2)"
            fill="color-mix(in oklch, var(--color-chart-2) 40%, transparent)"
            name="interest"
          />
          <Area
            type="monotone"
            dataKey="tax"
            stackId="1"
            stroke="var(--color-chart-4)"
            fill="color-mix(in oklch, var(--color-chart-4) 35%, transparent)"
            name="tax"
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
          {milestones.map((m) => (
            <ReferenceLine
              key={m}
              y={m}
              stroke="var(--color-muted-foreground)"
              strokeDasharray="6 4"
              strokeOpacity={0.5}
              label={{
                value: `${(m / 10_000).toLocaleString("ja-JP")}万円`,
                position: "right",
                fontSize: 11,
                fill: "var(--color-muted-foreground)",
              }}
            />
          ))}
          {currentTotalAssets != null && (
            <ReferenceLine
              y={currentTotalAssets}
              stroke="var(--color-primary)"
              strokeDasharray="6 4"
              strokeOpacity={0.6}
              label={{
                value: "現在の総資産",
                position: "insideBottomLeft",
                fontSize: 11,
                fill: "var(--color-primary)",
                offset: 6,
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted-foreground">
        ※
        このグラフは名目値（将来の金額そのもの）で表示しています。インフレによる購買力の変化は反映されていません
      </p>
    </>
  );
}
