"use client";

import { TrendingUp } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { CHART_INITIAL_DIMENSION, roundToNice } from "../../lib/chart";
import { semanticColors } from "../../lib/colors";
import { getShortMonth } from "../../lib/format";
import { buildGroupPath } from "../../lib/url";
import { ChartTooltipContent } from "../charts/chart-tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

interface MonthlySummary {
  month: string;
  totalIncome: number;
  totalExpense: number;
}

interface MonthlyIncomeExpenseChartProps {
  data: MonthlySummary[];
  groupId?: string;
}

export function MonthlyIncomeExpenseChartClient({ data, groupId }: MonthlyIncomeExpenseChartProps) {
  const router = useRouter();

  // Create a map of existing data by month
  const dataMap = new Map(data.map((d) => [d.month, d]));

  // Generate last 12 months
  const now = new Date();
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.push(month);
  }

  // Build chart data with 12 months, filling missing months with 0
  const chartData = months.map((month) => {
    const d = dataMap.get(month);
    const income = d?.totalIncome ?? 0;
    const expense = d?.totalExpense ?? 0;
    return {
      month: getShortMonth(month),
      originalMonth: month,
      収入: income,
      支出: -expense,
      収支: income - expense,
    };
  });

  const handleBarClick = (originalMonth: string) => {
    const path = buildGroupPath(groupId, `cf/${originalMonth}`);
    router.push(path as Route);
  };

  // Calculate Y axis domain based on actual income and expense ranges
  const maxIncome = Math.max(...chartData.map((d) => d.収入), 1);
  const maxExpense = Math.max(...chartData.map((d) => Math.abs(d.支出)), 1);

  // Add 10% padding and round to nice value
  const yAxisMax = roundToNice(maxIncome * 1.1);
  const yAxisMin = -roundToNice(maxExpense * 1.1);

  // Format value to 万円 or 億円
  const formatYAxis = (value: number) => {
    if (value === 0) return "0万円";
    const manEn = value / 10000;
    const absManEn = Math.abs(manEn);
    if (absManEn >= 10000) {
      return `${(manEn / 10000).toFixed(0)}億円`;
    }
    return `${manEn.toFixed(0)}万円`;
  };

  // Custom tooltip
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ value: number; dataKey: string }>;
  }) => {
    if (!active || !payload || payload.length === 0) return null;

    const income = payload.find((p) => p.dataKey === "収入")?.value ?? 0;
    const expense = Math.abs(payload.find((p) => p.dataKey === "支出")?.value ?? 0);
    const balance = payload.find((p) => p.dataKey === "収支")?.value ?? 0;

    const formatValue = (val: number) => {
      const manEn = val / 10000;
      // Show decimal if less than 1万円
      if (Math.abs(manEn) < 1 && manEn !== 0) {
        return manEn.toFixed(1);
      }
      return Math.round(manEn).toLocaleString();
    };

    return (
      <ChartTooltipContent>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground font-bold">収入</span>
          <span className="font-bold" style={{ color: semanticColors.income }}>
            {formatValue(income)}
            <span className="text-sm">万円</span>
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground font-bold">支出</span>
          <span className="font-bold" style={{ color: semanticColors.expense }}>
            {formatValue(expense)}
            <span className="text-sm">万円</span>
          </span>
        </div>
        <div className="flex justify-between gap-4 mt-1 pt-1 border-t">
          <span className="text-muted-foreground font-bold">収支</span>
          <span
            className="font-bold"
            style={{
              color: balance >= 0 ? semanticColors.balancePositive : semanticColors.balanceNegative,
            }}
          >
            {balance >= 0 ? "" : "-"}
            {formatValue(Math.abs(balance))}
            <span className="text-sm">万円</span>
          </span>
        </div>
      </ChartTooltipContent>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={TrendingUp}>月別収支推移</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350} initialDimension={CHART_INITIAL_DIMENSION}>
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
            stackOffset="sign"
          >
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: "#4B5563", fontWeight: 500 }}
              tickLine={false}
              axisLine={{ stroke: "#E2E8F0" }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#4B5563", fontWeight: 500 }}
              tickLine={false}
              axisLine={{ stroke: "#E2E8F0" }}
              tickFormatter={formatYAxis}
              domain={[yAxisMin, yAxisMax]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              align="right"
              verticalAlign="bottom"
              content={() => (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 16,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {[
                    { label: "収入", color: semanticColors.income },
                    { label: "支出", color: semanticColors.expense },
                    { label: "収支", color: semanticColors.balancePositive },
                  ].map(({ label, color }) => (
                    <span key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          backgroundColor: color,
                          borderRadius: label === "収支" ? "50%" : 0,
                          display: "inline-block",
                        }}
                      />
                      {label}
                    </span>
                  ))}
                </div>
              )}
            />
            <ReferenceLine y={0} stroke="#4B5563" strokeWidth={1} />
            <Bar
              dataKey="収入"
              fill={semanticColors.income}
              fillOpacity={0.5}
              stackId="stack"
              barSize={40}
              cursor="pointer"
              onClick={(data) =>
                handleBarClick((data as unknown as { originalMonth: string }).originalMonth)
              }
            />
            <Bar
              dataKey="支出"
              fill={semanticColors.expense}
              fillOpacity={0.5}
              stackId="stack"
              barSize={40}
              cursor="pointer"
              onClick={(data) =>
                handleBarClick((data as unknown as { originalMonth: string }).originalMonth)
              }
            />
            <Line
              type="monotone"
              dataKey="収支"
              stroke={semanticColors.balancePositive}
              strokeWidth={2.5}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
