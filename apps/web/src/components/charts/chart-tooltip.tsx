import type { CSSProperties, ReactNode } from "react";

/**
 * Recharts の <Tooltip contentStyle={...}> に渡す共通スタイル。
 * CSS 変数を参照しているためテーマ連動する。
 */
export const chartTooltipStyle: CSSProperties = {
  backgroundColor: "var(--color-card)",
  color: "var(--color-card-foreground)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  fontSize: "12px",
  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
};

export function formatChartLabel(label: unknown): string {
  return typeof label === "string" || typeof label === "number" ? String(label) : "";
}

/**
 * カスタム Tooltip の外枠。Recharts / Nivo の content prop で使う。
 */
export function ChartTooltipContent({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card text-card-foreground border border-border rounded-lg px-4 py-3 shadow-md text-sm whitespace-nowrap">
      {children}
    </div>
  );
}
