"use client";

import type { ChartCard } from "@mf-dashboard/analytics/chat/cards";
import { useId, type ReactElement } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type DotItemDotProps,
} from "recharts";
import { getChartColorArray, semanticColors } from "../../../lib/colors";
import { formatCurrency } from "../../../lib/format";
import { chartTooltipStyle } from "../../charts/chart-tooltip";

interface FinanceChatChartProps {
  card: ChartCard;
}

const SERIES_KEYS = ["value0", "value1", "value2"] as const;

function seriesKey(index: number): string {
  return SERIES_KEYS[index] ?? `value${index}`;
}

interface FinanceChartLineStyle {
  stroke: string;
  gradient?: {
    id: string;
    zeroOffset: number;
  };
}

export function getFinanceChartLineStyle(
  amountType: ChartCard["series"][number]["amountType"],
  values: readonly number[],
  gradientId: string,
): FinanceChartLineStyle {
  const hasNegativeValue = values.some((value) => value < 0);
  const hasNonNegativeValue = values.some((value) => value >= 0);

  if (amountType !== "balance" || !hasNegativeValue || !hasNonNegativeValue) {
    return { stroke: getFinanceChartSeriesColor(amountType, values) };
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);

  return {
    stroke: `url(#${gradientId})`,
    gradient: {
      id: gradientId,
      zeroOffset: (-minimum / (maximum - minimum)) * 100,
    },
  };
}

export function getFinanceChartSeriesColor(
  amountType: ChartCard["series"][number]["amountType"],
  values: readonly number[],
): string {
  if (amountType === "income") return semanticColors.income;
  if (amountType === "expense") return semanticColors.expense;
  return values.some((value) => value < 0)
    ? semanticColors.balanceNegative
    : semanticColors.balancePositive;
}

export function getFinanceChartValueColor(
  amountType: ChartCard["series"][number]["amountType"],
  value: number,
): string {
  if (amountType === "balance") {
    return value < 0 ? semanticColors.balanceNegative : semanticColors.balancePositive;
  }
  return getFinanceChartSeriesColor(amountType, [value]);
}

export function formatFinanceChartAxisValue(value: number, maximumAbsoluteValue: number): string {
  if (maximumAbsoluteValue < 10_000) return `${Math.round(value).toLocaleString("ja-JP")}円`;
  if (maximumAbsoluteValue < 100_000) return `${Math.round(value / 1000)}千円`;
  return `${Math.round(value / 10_000)}万円`;
}

export function FinanceChatChart({ card }: FinanceChatChartProps) {
  const chartId = useId().replaceAll(":", "");
  const data = card.data.map((point) => ({
    label: point.label,
    ...Object.fromEntries(point.values.map((value, index) => [seriesKey(index), value])),
  }));
  const chartColors = getChartColorArray(data.length);
  const maximumAbsoluteValue = Math.max(
    ...card.data.flatMap((point) => point.values.map((value) => Math.abs(value))),
  );
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
      <YAxis
        width={48}
        tick={{ fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        tickFormatter={(value) => formatFinanceChartAxisValue(Number(value), maximumAbsoluteValue)}
      />
      <Tooltip
        formatter={(value) => formatCurrency(Number(value))}
        contentStyle={chartTooltipStyle}
      />
      {card.series.length > 1 && <Legend />}
    </>
  );
  let chart: ReactElement;

  if (card.chartType === "line") {
    const lineStyles = card.series.map((series, index) =>
      getFinanceChartLineStyle(
        series.amountType,
        card.data.map((point) => point.values[index] ?? 0),
        `${chartId}-balance-${index}`,
      ),
    );
    chart = (
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <defs>
          {lineStyles.map((style) =>
            style.gradient ? (
              <linearGradient
                key={style.gradient.id}
                id={style.gradient.id}
                x1="0"
                y1="100%"
                x2="0"
                y2="0%"
              >
                <stop offset="0%" stopColor={semanticColors.balanceNegative} />
                <stop
                  offset={`${style.gradient.zeroOffset}%`}
                  stopColor={semanticColors.balanceNegative}
                />
                <stop
                  offset={`${style.gradient.zeroOffset}%`}
                  stopColor={semanticColors.balancePositive}
                />
                <stop offset="100%" stopColor={semanticColors.balancePositive} />
              </linearGradient>
            ) : null,
          )}
        </defs>
        {common}
        {card.series.map((series, index) => {
          const renderDot = ({ cx, cy, value }: DotItemDotProps) => {
            if (cx === undefined || cy === undefined) return null;
            const color = getFinanceChartValueColor(series.amountType, Number(value));
            return <circle cx={cx} cy={cy} r={3} fill={color} stroke={color} />;
          };

          return (
            <Line
              key={series.name}
              type="monotone"
              dataKey={seriesKey(index)}
              name={series.name}
              stroke={lineStyles[index]?.stroke}
              strokeWidth={2}
              dot={renderDot}
              activeDot={false}
            />
          );
        })}
      </LineChart>
    );
  } else if (card.chartType === "bar") {
    chart = (
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        {common}
        {card.series.map((series, index) => (
          <Bar
            key={series.name}
            dataKey={seriesKey(index)}
            name={series.name}
            fill={getFinanceChartSeriesColor(
              series.amountType,
              card.data.map((point) => point.values[index] ?? 0),
            )}
            radius={[3, 3, 0, 0]}
          >
            {series.amountType === "balance" &&
              card.data.map((point) => (
                <Cell
                  key={`${series.name}-${point.label}`}
                  fill={getFinanceChartValueColor(series.amountType, point.values[index] ?? 0)}
                />
              ))}
          </Bar>
        ))}
      </BarChart>
    );
  } else {
    chart = (
      <PieChart>
        <Pie data={data} dataKey="value0" nameKey="label" innerRadius={45} outerRadius={80}>
          {data.map((point, index) => (
            <Cell key={point.label} fill={chartColors[index]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatCurrency(Number(value))}
          contentStyle={chartTooltipStyle}
        />
      </PieChart>
    );
  }

  return (
    <figure aria-label={card.title}>
      <ResponsiveContainer width="100%" height={220}>
        {chart}
      </ResponsiveContainer>
      <ul className="sr-only">
        {card.data.map((point) => (
          <li key={point.label}>
            {point.label}: {point.values.map((value) => formatCurrency(value)).join("、")}
          </li>
        ))}
      </ul>
    </figure>
  );
}
