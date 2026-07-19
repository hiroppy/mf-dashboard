"use client";

import type { LucideIcon } from "lucide-react";
import { TrendingUp } from "lucide-react";
import {
  LineChart as RechartsLineChart,
  Line,
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

interface LineChartProps {
  title: string;
  icon?: LucideIcon;
  data: Array<Record<string, unknown>>;
  lines: Array<{
    dataKey: string;
    name: string;
    color: string;
  }>;
  xAxisKey: string;
  height?: number;
}

export function LineChart({ title, icon, data, lines, xAxisKey, height = 300 }: LineChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle icon={icon ?? TrendingUp}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer
          width="100%"
          height={height}
          initialDimension={CHART_INITIAL_DIMENSION}
        >
          <RechartsLineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
              labelFormatter={(label) => `${label}`}
              contentStyle={chartTooltipStyle}
            />
            <Legend />
            {lines.map((line) => (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                name={line.name}
                stroke={line.color}
                strokeWidth={2}
                dot={{ fill: line.color, strokeWidth: 2, r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </RechartsLineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
