"use client";

import { LineChart as LineChartIcon } from "lucide-react";
import { useState, useEffect } from "react";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { sortByAmountDescending } from "../../lib/amount-order";
import {
  CHART_INITIAL_DIMENSION,
  CHART_PERIOD_OPTIONS,
  filterDataByPeriod,
  type Period,
} from "../../lib/chart";
import { getAssetCategoryColor, semanticColors } from "../../lib/colors";
import { formatCurrency } from "../../lib/format";
import { cn } from "../../lib/utils";
import { ChartTooltipContent } from "../charts/chart-tooltip";
import { AmountDisplay } from "../ui/amount-display";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { PeriodToggle } from "../ui/period-toggle";

interface AssetHistoryPoint {
  date: string;
  totalAssets: number;
  categories: Record<string, number>;
}

interface AssetHistoryChartProps {
  data: AssetHistoryPoint[];
  height?: number;
}

interface AssetHistoryTooltipProps {
  active?: boolean;
  label?: string;
  payload?: ReadonlyArray<{
    color?: string;
    dataKey?: string | number;
    name?: string;
    value?: number;
  }>;
  period: Period;
}

export function AssetHistoryTooltip({ active, label, payload, period }: AssetHistoryTooltipProps) {
  if (!active || !label || !payload?.length) return null;

  const [year, month, day] = label.split("-");
  const formattedDate =
    period === "1m" ? `${year}/${Number(month)}/${Number(day)}` : `${year}/${Number(month)}`;
  const totalAssets = payload.find((item) => item.dataKey === "totalAssets")?.value;
  const categories = payload.filter((item) => item.dataKey !== "totalAssets");
  const orderedCategories = sortByAmountDescending(
    categories,
    (item) => item.value,
    (item) => String(item.dataKey),
  );

  return (
    <ChartTooltipContent>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">{formattedDate}</span>
        {totalAssets !== undefined && (
          <span className="font-semibold">{formatCurrency(totalAssets)}</span>
        )}
      </div>
      {orderedCategories.length > 0 && (
        <div className="mt-2 space-y-1 border-t pt-2">
          {orderedCategories.map((item) => (
            <div key={String(item.dataKey)} className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-2">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden
                />
                {item.name}
              </span>
              <span>{formatCurrency(item.value ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </ChartTooltipContent>
  );
}

export function AssetHistoryChartClient({ data, height = 350 }: AssetHistoryChartProps) {
  const [period, setPeriod] = useState<Period>("6m");
  const [visibleLines, setVisibleLines] = useState<Set<string>>(() => new Set(["totalAssets"]));

  const categoryLines =
    data.length === 0
      ? [
          {
            dataKey: "totalAssets",
            name: "総資産",
            color: semanticColors.totalAssets,
          },
        ]
      : [
          {
            dataKey: "totalAssets",
            name: "総資産",
            color: semanticColors.totalAssets,
          },
          ...sortByAmountDescending(
            Object.entries(data[data.length - 1].categories),
            ([, amount]) => amount,
            ([name]) => name,
          ).map(([name]) => ({
            dataKey: name,
            name,
            color: getAssetCategoryColor(name),
          })),
        ];

  // When data changes, update visible lines to show all categories
  useEffect(() => {
    setVisibleLines(new Set(categoryLines.map((l) => l.dataKey)));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredData = filterDataByPeriod(data, period).map((d) => ({
    ...d.categories,
    totalAssets: d.totalAssets,
    date: d.date,
  }));

  const formatDateLabel = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    const m = Number(month);
    const d = Number(day);
    if (period === "1m") {
      return `${m}/${d}`;
    }
    if (period === "3m" || period === "6m") {
      return `${m}月`;
    }
    // 1y, all: 年をまたぐので年も表示
    return `${year}/${m}`;
  };

  const categoryDiffs =
    filteredData.length < 2
      ? null
      : categoryLines.reduce(
          (acc, line) => {
            const key = line.dataKey;
            const first = filteredData[0];
            const last = filteredData[filteredData.length - 1];
            acc[key] =
              ((last[key as keyof typeof last] as number) ?? 0) -
              ((first[key as keyof typeof first] as number) ?? 0);
            return acc;
          },
          {} as Record<string, number>,
        );

  const toggleLine = (dataKey: string) => {
    setVisibleLines((prev) => {
      const next = new Set(prev);
      if (next.has(dataKey)) {
        next.delete(dataKey);
      } else {
        next.add(dataKey);
      }
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle icon={LineChartIcon}>資産推移</CardTitle>
          <PeriodToggle
            options={CHART_PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
            className="self-end sm:self-auto"
          />
        </div>
        <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
          {categoryLines.map((line) => {
            const diff = categoryDiffs?.[line.dataKey];
            return (
              <button
                key={line.dataKey}
                onClick={() => toggleLine(line.dataKey)}
                className={cn(
                  "shrink-0 px-2 py-0.5 text-sm rounded-full border transition-colors whitespace-nowrap",
                  visibleLines.has(line.dataKey)
                    ? "text-foreground"
                    : "border-muted-foreground/30 text-muted-foreground bg-transparent",
                )}
                style={{
                  backgroundColor: visibleLines.has(line.dataKey)
                    ? `color-mix(in srgb, ${line.color} 20%, transparent)`
                    : undefined,
                  borderColor: visibleLines.has(line.dataKey) ? line.color : undefined,
                }}
              >
                {line.name}
                {diff !== undefined && (
                  <AmountDisplay
                    amount={diff}
                    showSign
                    weight="semibold"
                    className="ml-1 opacity-90"
                  />
                )}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer
          width="100%"
          height={height}
          initialDimension={CHART_INITIAL_DIMENSION}
        >
          <RechartsLineChart
            data={filteredData}
            margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              tickFormatter={formatDateLabel}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${(value / 10000).toFixed(0)}万`}
            />
            <Tooltip content={<AssetHistoryTooltip period={period} />} />
            {categoryLines
              .filter((line) => visibleLines.has(line.dataKey))
              .map((line) => (
                <Line
                  key={line.dataKey}
                  type="monotone"
                  dataKey={line.dataKey}
                  name={line.name}
                  stroke={line.color}
                  strokeWidth={line.dataKey === "totalAssets" ? 2.5 : 1.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                  animationDuration={300}
                />
              ))}
          </RechartsLineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
