"use client";

import {
  RadarChart as RechartsRadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { chartTooltipStyle } from "./chart-tooltip";

interface RadarChartCategory {
  name: string;
  score: number;
  maxScore: number;
}

interface RadarChartProps {
  categories: RadarChartCategory[];
  height?: number;
}

export function RadarChart({ categories, height = 280 }: RadarChartProps) {
  const data = categories.map((cat) => ({
    subject: cat.name,
    value: Math.round((cat.score / cat.maxScore) * 100),
    score: cat.score,
    maxScore: cat.maxScore,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsRadarChart cx="50%" cy="50%" outerRadius="65%" data={data}>
        <PolarGrid className="stroke-muted" />
        <PolarAngleAxis
          dataKey="subject"
          tick={(props: Record<string, unknown>) => {
            const { x, y, payload, index, cx, cy } = props as {
              x: number;
              y: number;
              payload: { value: string };
              index: number;
              cx: number;
              cy: number;
            };
            const item = data[index];
            const dx = x - cx;
            const dy = y - cy;
            const anchor = dx > 5 ? "start" : dx < -5 ? "end" : "middle";
            const isTop = dy < -5;
            const isBottom = dy > 5;
            const baseline = isTop ? "auto" : isBottom ? "hanging" : "central";
            return (
              <text
                x={x}
                y={y}
                textAnchor={anchor}
                dominantBaseline={baseline}
                fontSize={12}
                fill="var(--color-muted-foreground)"
              >
                <tspan x={x} dy={isTop ? "-1.2em" : isBottom ? "0em" : "-0.4em"} fontSize={13}>
                  {payload.value}
                </tspan>
                <tspan
                  x={x}
                  dy="1.2em"
                  fontSize={12}
                  fontWeight="bold"
                  fill="var(--color-foreground)"
                >
                  {Math.round(item.score)}/{item.maxScore}
                </tspan>
              </text>
            );
          }}
        />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          dataKey="value"
          stroke="var(--color-primary)"
          fill="var(--color-primary)"
          fillOpacity={0.2}
          strokeWidth={2}
        />
        <Tooltip
          contentStyle={chartTooltipStyle}
          formatter={(_value, _name, props) => {
            const { score, maxScore } = props.payload as { score: number; maxScore: number };
            return [`${Math.round(score)} / ${maxScore}`, "スコア"];
          }}
        />
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}
