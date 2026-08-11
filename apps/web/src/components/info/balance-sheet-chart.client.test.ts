import { describe, expect, it } from "vitest";
import { formatAssetShare, getBalanceSheetChartOrder } from "./balance-sheet-chart.client";

describe("formatAssetShare", () => {
  it.each([
    [3_000_000, 11_500_000, "(26.1%)"],
    [-100, 1_000, "(-10.0%)"],
    [100, 0, "(0.0%)"],
  ])("%s円 / %s円を%sと表示する", (amount, totalAssets, expected) => {
    expect(formatAssetShare(amount, totalAssets)).toBe(expected);
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
