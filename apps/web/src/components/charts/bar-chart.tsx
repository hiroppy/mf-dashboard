"use client";

import type { LucideIcon } from "lucide-react";
import { BarChart3 } from "lucide-react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CHART_INITIAL_DIMENSION } from "../../lib/chart";
import { formatCurrency } from "../../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { chartTooltipStyle } from "./chart-tooltip";

interface BarChartProps {
  title: string;
  icon?: LucideIcon;
  data: Array<Record<string, unknown>>;
  bars: Array<{
    dataKey: string;
    name: string;
    color: string;
    stackId?: string;
  }>;
  xAxisKey: string;
  height?: number;
}

export function BarChart({ title, icon, data, bars, xAxisKey, height = 300 }: BarChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle icon={icon ?? BarChart3}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer
          width="100%"
          height={height}
          initialDimension={CHART_INITIAL_DIMENSION}
        >
          <RechartsBarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${(value / 10000).toFixed(0)}万`}
            />
            <Tooltip
              formatter={(value) => formatCurrency(value as number)}
              contentStyle={chartTooltipStyle}
            />
            <Legend />
            {bars.map((bar) => (
              <Bar
                key={bar.dataKey}
                dataKey={bar.dataKey}
                name={bar.name}
                fill={bar.color}
                stackId={bar.stackId}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </RechartsBarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
