"use client";

import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_INITIAL_DIMENSION } from "../../lib/chart";
import { formatCurrency } from "../../lib/format";
import { chartTooltipStyle } from "./chart-tooltip";

interface TreemapDataItem {
  name: string;
  value: number;
  color: string;
  [key: string]: string | number | null | undefined;
}

interface TreemapChartProps {
  data: TreemapDataItem[];
  height?: number;
}

// Approximate character width for truncation (Japanese ~12px, ASCII ~7px at 12px font)
function truncateText(text: string, maxWidth: number): string {
  let totalWidth = 0;
  let truncateIndex = text.length;

  for (let i = 0; i < text.length; i++) {
    // Japanese/CJK characters are wider
    const charWidth = text.charCodeAt(i) > 255 ? 12 : 7;
    if (totalWidth + charWidth > maxWidth) {
      truncateIndex = i;
      break;
    }
    totalWidth += charWidth;
  }

  if (truncateIndex >= text.length) return text;
  if (truncateIndex <= 1) return "";
  return `${text.slice(0, truncateIndex - 1)}…`;
}

interface CustomContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  color?: string;
}

function CustomizedContent({ x, y, width, height, name, color }: CustomContentProps) {
  if (!width || !height) return null;

  const showName = width > 60 && height > 35;

  // Round to avoid subpixel rendering
  const rx = Math.round(x ?? 0);
  const ry = Math.round(y ?? 0);
  const rw = Math.round(width);
  const rh = Math.round(height);

  return (
    <g>
      <rect
        x={rx}
        y={ry}
        width={rw}
        height={rh}
        fill={color ?? "var(--color-muted)"}
        stroke="var(--color-background)"
        strokeWidth={2}
        rx={4}
        style={{ opacity: 0.85 }}
      />
      {showName && (
        <text
          x={rx + rw / 2}
          y={ry + rh / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          stroke="none"
          fontSize={12}
          fontWeight={500}
          style={{ pointerEvents: "none" }}
        >
          {truncateText(name ?? "", rw - 16)}
        </text>
      )}
    </g>
  );
}

export function TreemapChart({ data, height = 200 }: TreemapChartProps) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={height} initialDimension={CHART_INITIAL_DIMENSION}>
      <Treemap
        data={data}
        dataKey="value"
        aspectRatio={4 / 3}
        stroke="var(--color-background)"
        content={<CustomizedContent />}
        animationDuration={400}
      >
        <Tooltip
          formatter={(value, _name, props) => {
            const item = props.payload as TreemapDataItem;
            return [formatCurrency(value as number), item.name];
          }}
          contentStyle={chartTooltipStyle}
        />
      </Treemap>
    </ResponsiveContainer>
  );
}
