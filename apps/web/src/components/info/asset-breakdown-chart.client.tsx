"use client";

import { PieChart as PieChartIcon } from "lucide-react";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  CHART_INITIAL_DIMENSION,
  COMPARISON_PERIOD_OPTIONS,
  type ComparisonPeriod,
} from "../../lib/chart";
import { getAssetCategoryColor } from "../../lib/colors";
import { formatCurrency } from "../../lib/format";
import { chartTooltipStyle } from "../charts/chart-tooltip";
import { AmountDisplay } from "../ui/amount-display";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { PeriodToggle } from "../ui/period-toggle";

interface CategoryChange {
  name: string;
  current: number;
  previous: number;
  change: number;
}

interface PeriodChanges {
  categories: CategoryChange[];
  total: {
    current: number;
    previous: number;
    change: number;
  };
}

interface AssetBreakdownChartProps {
  data: Array<{ category: string; amount: number }>;
  dailyChanges: PeriodChanges | null;
  weeklyChanges: PeriodChanges | null;
  monthlyChanges: PeriodChanges | null;
  netAssets: number | null;
  className?: string;
}

function ChangeValue({ value }: { value: number }) {
  if (value === 0) {
    return <AmountDisplay amount={0} className="text-muted-foreground" />;
  }
  return <AmountDisplay amount={value} type="balance" showSign weight="semibold" />;
}

export function AssetBreakdownChartClient({
  data,
  dailyChanges,
  weeklyChanges,
  monthlyChanges,
  netAssets,
  className,
}: AssetBreakdownChartProps) {
  const [period, setPeriod] = useState<ComparisonPeriod>("daily");

  const chartData = data
    .filter((item) => item.amount > 0)
    .map((item) => ({
      name: item.category,
      value: item.amount,
      color: getAssetCategoryColor(item.category),
    }));

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  const periodData =
    period === "daily" ? dailyChanges : period === "weekly" ? weeklyChanges : monthlyChanges;

  // Build a map of category changes for quick lookup
  const changeMap = new Map(periodData?.categories.map((c) => [c.name, c]) ?? []);

  if (total === 0) return <EmptyState icon={PieChartIcon} title="資産構成" />;

  return (
    <Card className={className}>
      <CardHeader
        className="pb-2"
        action={
          <PeriodToggle options={COMPARISON_PERIOD_OPTIONS} value={period} onChange={setPeriod} />
        }
      >
        <CardTitle icon={PieChartIcon}>資産構成</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
          <div className="w-32 h-32 shrink-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={CHART_INITIAL_DIMENSION}
            >
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={60}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatCurrency(value as number)}
                  contentStyle={chartTooltipStyle}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 min-w-0 w-full space-y-2 text-sm">
            {chartData.map((item) => {
              const change = changeMap.get(item.name);
              return (
                <div key={item.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-muted-foreground truncate">
                      {item.name}{" "}
                      <span className="font-medium text-foreground">
                        {((item.value / total) * 100).toFixed(0)}%
                      </span>
                    </span>
                  </div>
                  <div className="shrink-0 text-right sm:flex sm:items-center sm:gap-2">
                    <AmountDisplay amount={item.value} weight="medium" className="tabular-nums" />
                    <div className="tabular-nums text-sm sm:w-24 sm:text-right">
                      {change ? (
                        <ChangeValue value={change.change} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {periodData && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-3" />
                  <span className="font-medium">総資産</span>
                </div>
                <div className="shrink-0 text-right sm:flex sm:items-center sm:gap-2">
                  <AmountDisplay
                    amount={periodData.total.current}
                    weight="bold"
                    className="tabular-nums"
                  />
                  <div className="tabular-nums sm:w-24 sm:text-right font-medium">
                    <ChangeValue value={periodData.total.change} />
                  </div>
                </div>
              </div>
            )}
            {netAssets !== null && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-3" />
                  <span className="font-medium">純資産</span>
                </div>
                <div className="shrink-0 text-right sm:flex sm:items-center sm:gap-2">
                  <AmountDisplay amount={netAssets} weight="medium" className="tabular-nums" />
                  <span className="hidden sm:inline-block sm:w-24" />
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
