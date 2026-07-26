"use client";

import type { LucideIcon } from "lucide-react";
import { PieChart as PieChartIcon } from "lucide-react";
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_INITIAL_DIMENSION } from "../../lib/chart";
import { getCategoryColor, getChartColorArray } from "../../lib/colors";
import { formatCurrency } from "../../lib/format";
import { AmountDisplay } from "../ui/amount-display";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { chartTooltipStyle } from "./chart-tooltip";

interface PieChartProps {
  title: string;
  icon?: LucideIcon;
  data: Array<{ name: string; value: number }>;
  height?: number;
  useCustomColors?: boolean;
  selectedName?: string;
  onSelect?: (name: string) => void;
}

// Minimum percentage to show label (hide labels for small slices)
const MIN_LABEL_PERCENT = 0.05;

export function PieChart({
  title,
  icon,
  data,
  height = 300,
  useCustomColors = true,
  selectedName,
  onSelect,
}: PieChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const colors = useCustomColors
    ? data.map((item) => getCategoryColor(item.name))
    : getChartColorArray(data.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={icon ?? PieChartIcon}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer
          width="100%"
          height={height}
          initialDimension={CHART_INITIAL_DIMENSION}
        >
          <RechartsPieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={0}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) =>
                (percent ?? 0) >= MIN_LABEL_PERCENT
                  ? `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  : ""
              }
              labelLine={false}
              isAnimationActive={false}
              onClick={(entry) => {
                if (entry.name) onSelect?.(entry.name);
              }}
              className={onSelect ? "cursor-pointer" : undefined}
            >
              {data.map((item, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={colors[index]}
                  opacity={selectedName && selectedName !== item.name ? 0.35 : 1}
                  stroke={selectedName === item.name ? "var(--foreground)" : undefined}
                  strokeWidth={selectedName === item.name ? 2 : undefined}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [formatCurrency(value as number), name]}
              contentStyle={chartTooltipStyle}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
        {/* Legend for all items */}
        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
          {data.map((item, index) => (
            <button
              key={item.name}
              type="button"
              className="flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
              aria-pressed={onSelect ? selectedName === item.name : undefined}
              onClick={() => onSelect?.(item.name)}
              disabled={!onSelect}
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: colors[index] }}
              />
              <span className="text-muted-foreground">
                {item.name}{" "}
                <span className="font-medium text-foreground">
                  {((item.value / total) * 100).toFixed(0)}%
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="text-center mt-2">
          <AmountDisplay amount={total} weight="bold" />
        </div>
      </CardContent>
    </Card>
  );
}
