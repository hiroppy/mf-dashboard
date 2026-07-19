import { describe, expect, it } from "vitest";
import { semanticColors } from "../../../lib/colors";
import {
  formatFinanceChartAxisValue,
  getFinanceChartLineStyle,
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

  it("colors a continuous mixed-sign line on each side of zero", () => {
    expect(getFinanceChartLineStyle("balance", [-1000, 1000], "balance-gradient")).toEqual({
      stroke: "url(#balance-gradient)",
      gradient: { id: "balance-gradient", zeroOffset: 50 },
    });
    expect(getFinanceChartLineStyle("balance", [-1000, 3000], "balance-gradient")).toEqual({
      stroke: "url(#balance-gradient)",
      gradient: { id: "balance-gradient", zeroOffset: 25 },
    });
  });

  it("keeps a single line for a balance series with one sign", () => {
    expect(getFinanceChartLineStyle("balance", [0, 2000], "balance-gradient")).toEqual({
      stroke: semanticColors.balancePositive,
    });
  });
});
