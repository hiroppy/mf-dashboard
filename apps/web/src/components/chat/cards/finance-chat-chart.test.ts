import { describe, expect, it } from "vitest";
import { semanticColors } from "../../../lib/colors";
import {
  formatFinanceChartAxisValue,
  getFinanceChartLineVariants,
  getFinanceChartSeriesColor,
  getFinanceChartValueColor,
} from "./finance-chat-chart";

describe("formatFinanceChartAxisValue", () => {
  it("keeps small yen values meaningful", () => {
    expect(formatFinanceChartAxisValue(4000, 5000)).toBe("4,000円");
  });

  it("uses compact units for larger values", () => {
    expect(formatFinanceChartAxisValue(40_000, 50_000)).toBe("40千円");
    expect(formatFinanceChartAxisValue(400_000, 500_000)).toBe("40万円");
  });
});

describe("getFinanceChartSeriesColor", () => {
  it("uses the negative semantic color when a balance series contains a loss", () => {
    expect(getFinanceChartSeriesColor("balance", [-1000, -2000])).toBe(
      semanticColors.balanceNegative,
    );
  });

  it("selects a semantic balance color for each mixed-sign bar value", () => {
    expect(getFinanceChartValueColor("balance", 1000)).toBe(semanticColors.balancePositive);
    expect(getFinanceChartValueColor("balance", -1000)).toBe(semanticColors.balanceNegative);
  });

  it("splits a mixed-sign balance line into positive and negative semantic series", () => {
    expect(getFinanceChartLineVariants("balance", [-1000, 2000], "value0")).toEqual([
      { dataKey: "value0Positive", stroke: semanticColors.balancePositive },
      { dataKey: "value0Negative", stroke: semanticColors.balanceNegative },
    ]);
  });

  it("keeps a single line for a balance series with one sign", () => {
    expect(getFinanceChartLineVariants("balance", [0, 2000], "value0")).toEqual([
      { dataKey: "value0", stroke: semanticColors.balancePositive },
    ]);
  });
});
