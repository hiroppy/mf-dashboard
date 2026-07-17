import { render } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { AssetBreakdownChartClient } from "./asset-breakdown-chart.client";

const { pieMock } = vi.hoisted(() => ({
  pieMock: vi.fn<(props: Record<string, unknown>) => void>(),
}));

vi.mock("recharts", () => ({
  Cell: () => null,
  Pie: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => {
    pieMock(props);
    return <div>{children}</div>;
  },
  PieChart: ({ children }: PropsWithChildren) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: PropsWithChildren) => <div>{children}</div>,
  Tooltip: () => null,
}));

describe("AssetBreakdownChartClient", () => {
  it("disables pie animation to keep the mobile navigation responsive", () => {
    render(
      <AssetBreakdownChartClient
        data={[{ category: "現金", amount: 1000 }]}
        dailyChanges={null}
        weeklyChanges={null}
        monthlyChanges={null}
        netAssets={1000}
      />,
    );

    expect(pieMock).toHaveBeenCalledWith(expect.objectContaining({ isAnimationActive: false }));
  });
});
