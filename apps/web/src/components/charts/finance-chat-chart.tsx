"use client";

import type { FinanceChart } from "@mf-dashboard/analytics/chat/chart";
import { useId } from "react";
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
} from "recharts";
import { getChartColorArray, semanticColors } from "../../lib/colors";
import { formatCurrency } from "../../lib/format";
import { chartTooltipStyle } from "./chart-tooltip";

interface FinanceChatChartProps {
  chart: FinanceChart;
}

function seriesKey(index: number): string {
  return `value${index}`;
}

export function getFinanceChartSeriesColor(
  series: FinanceChart["series"][number],
  values: number[],
): string {
  if (series.amountType === "income") return semanticColors.income;
  if (series.amountType === "expense") return semanticColors.expense;
  if (series.amountType === "liability") return semanticColors.balanceNegative;
  return values.every((value) => value < 0)
    ? semanticColors.balanceNegative
    : semanticColors.balancePositive;
}

function getBalanceGradientOffset(values: number[]): number | undefined {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum >= 0 || maximum <= 0) return undefined;
  return (maximum / (maximum - minimum)) * 100;
}

export function getFinanceChartLineStroke(
  series: FinanceChart["series"][number],
  values: number[],
  gradientId: string,
): string {
  if (series.amountType === "balance" && getBalanceGradientOffset(values) !== undefined) {
    return `url(#${gradientId})`;
  }
  return getFinanceChartSeriesColor(series, values);
}

function formatValue(value: number, unit: FinanceChart["unit"], compact = false): string {
  if (unit === "count") return `${Math.round(value).toLocaleString("ja-JP")}件`;
  if (unit === "percent") return `${Number(value.toFixed(1)).toLocaleString("ja-JP")}%`;
  if (!compact) return formatCurrency(value);

  const absoluteValue = Math.abs(value);
  if (absoluteValue < 10_000) return `${Math.round(value).toLocaleString("ja-JP")}円`;
  if (absoluteValue < 100_000_000) return `${Math.round(value / 10_000)}万円`;
  return `${Number((value / 100_000_000).toFixed(1)).toLocaleString("ja-JP")}億円`;
}

export function FinanceChatChart({ chart }: FinanceChatChartProps) {
  const chartId = useId().replaceAll(":", "");
  const unit = chart.unit ?? "currency";
  const data = chart.data.map((point) => ({
    label: point.label,
    ...Object.fromEntries(point.values.map((value, index) => [seriesKey(index), value])),
  }));
  const seriesValues = chart.series.map((_, index) =>
    chart.data.map((point) => point.values[index] ?? 0),
  );
  const categoryColors = getChartColorArray(data.length);
  const commonAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
      <YAxis
        width={52}
        tick={{ fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        tickFormatter={(value) => formatValue(Number(value), unit, true)}
      />
      <Tooltip
        formatter={(value) => formatValue(Number(value), unit)}
        contentStyle={chartTooltipStyle}
      />
      {chart.series.length > 1 && <Legend />}
    </>
  );
  let visualization;

  if (chart.chartType === "line") {
    visualization = (
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <defs>
          {chart.series.map((series, index) => {
            const offset = getBalanceGradientOffset(seriesValues[index] ?? []);
            if (series.amountType !== "balance" || offset === undefined) return null;

            return (
              <linearGradient key={series.name} id={`${chartId}-series-${index}`} x2="0" y2="1">
                <stop offset={`${offset}%`} stopColor={semanticColors.balancePositive} />
                <stop offset={`${offset}%`} stopColor={semanticColors.balanceNegative} />
              </linearGradient>
            );
          })}
        </defs>
        {commonAxes}
        {chart.series.map((series, index) => (
          <Line
            key={series.name}
            type="monotone"
            dataKey={seriesKey(index)}
            name={series.name}
            stroke={getFinanceChartLineStroke(
              series,
              seriesValues[index] ?? [],
              `${chartId}-series-${index}`,
            )}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    );
  } else if (chart.chartType === "bar") {
    visualization = (
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        {commonAxes}
        {chart.series.map((series, index) => (
          <Bar
            key={series.name}
            dataKey={seriesKey(index)}
            name={series.name}
            fill={getFinanceChartSeriesColor(series, seriesValues[index] ?? [])}
            radius={[3, 3, 0, 0]}
          >
            {series.amountType === "balance" &&
              chart.data.map((point) => (
                <Cell
                  key={point.label}
                  fill={
                    (point.values[index] ?? 0) < 0
                      ? semanticColors.balanceNegative
                      : semanticColors.balancePositive
                  }
                />
              ))}
          </Bar>
        ))}
      </BarChart>
    );
  } else {
    visualization = (
      <PieChart>
        <Pie data={data} dataKey="value0" nameKey="label" innerRadius={48} outerRadius={82}>
          {data.map((point, index) => (
            <Cell key={point.label} fill={categoryColors[index]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatValue(Number(value), unit)}
          contentStyle={chartTooltipStyle}
        />
      </PieChart>
    );
  }

  return (
    <figure aria-label={chart.title} className="w-full min-w-0">
      <figcaption className="mb-3 text-sm font-semibold">{chart.title}</figcaption>
      <ResponsiveContainer width="100%" height={240}>
        {visualization}
      </ResponsiveContainer>
      {chart.chartType === "pie" && (
        <ul
          aria-hidden="true"
          className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
        >
          {chart.data.map((point, index) => (
            <li key={point.label} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ backgroundColor: categoryColors[index] }}
              />
              {point.label}
            </li>
          ))}
        </ul>
      )}
      <ul className="sr-only">
        {chart.data.map((point) => (
          <li key={point.label}>
            {point.label}:{" "}
            {point.values
              .map((value, index) => `${chart.series[index]?.name}: ${formatValue(value, unit)}`)
              .join("、")}
          </li>
        ))}
      </ul>
    </figure>
  );
}
