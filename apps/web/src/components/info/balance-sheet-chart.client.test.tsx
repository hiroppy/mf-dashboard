import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  BalanceSheetTooltip,
  getBalanceSheetChartOrder,
  getBalanceSheetShare,
} from "./balance-sheet-chart.client";

afterEach(cleanup);

describe("getBalanceSheetShare", () => {
  it.each([
    [2, 1_000, 0.2],
    [11, 1_000, 1.1],
    [100, 1_000, 10],
    [1_000, 1_000, 100],
    [-11, 1_000, -1.1],
    [100, 0, 0],
  ])("%s円 / %s円の比率を%sとして返す", (amount, total, expected) => {
    expect(getBalanceSheetShare(amount, total)).toBeCloseTo(expected);
  });
});

describe("BalanceSheetTooltip", () => {
  it("金額と共通パーセント表示を固定幅の列に分ける", () => {
    render(
      <BalanceSheetTooltip
        active
        label="資産"
        payload={[
          { name: "Asset A", value: 380, fill: "#000" },
          { name: "Asset B", value: 1, fill: "#fff" },
        ]}
        totalAssets={1_000}
        totalLiabilities={200}
        netAssets={800}
      />,
    );

    expect(screen.getByText("380円").className).toContain("min-w-28");
    expect(screen.getByText("1円").className).toContain("min-w-28");
    expect(screen.getByText("38.0%").className).toContain("min-w-14");
    expect(screen.getByText("0.1%").className).toContain("min-w-14");
    expect(screen.queryByText("(38.0%)")).toBeNull();
  });
});

describe("getBalanceSheetChartOrder", () => {
  it("凡例を金額降順、同額は項目名順にし、積み上げ順を反転する", () => {
    const order = getBalanceSheetChartOrder(
      [
        { category: "Asset C", amount: -100 },
        { category: "Asset B", amount: 300 },
        { category: "Asset A", amount: 300 },
      ],
      200,
      100,
    );

    expect(order.orderedAssets.map((asset) => asset.category)).toEqual([
      "Asset A",
      "Asset B",
      "Asset C",
    ]);
    expect(order.legendKeys).toEqual(["Asset A", "Asset B", "負債", "純資産", "Asset C"]);
    expect(order.stackedAssetKeys).toEqual(["Asset C", "Asset B", "Asset A"]);
    expect(order.stackedBalanceKeys.map((item) => item.key)).toEqual(["純資産", "負債"]);
  });
});
