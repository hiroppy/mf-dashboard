import { describe, expect, it } from "vitest";
import { financeChartSchema } from "./chart";

describe("financeChartSchema", () => {
  it("accepts a chart with matching series values", () => {
    expect(
      financeChartSchema.safeParse({
        title: "月別収支",
        chartType: "line",
        series: [{ name: "収支", amountType: "balance" }],
        data: [
          { label: "6月", values: [100_000] },
          { label: "7月", values: [-20_000] },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects mismatched series values", () => {
    expect(
      financeChartSchema.safeParse({
        title: "月別収支",
        chartType: "bar",
        series: [
          { name: "収入", amountType: "income" },
          { name: "支出", amountType: "expense" },
        ],
        data: [{ label: "7月", values: [400_000] }],
      }).success,
    ).toBe(false);
  });

  it("rejects negative pie values", () => {
    expect(
      financeChartSchema.safeParse({
        title: "支出構成",
        chartType: "pie",
        series: [{ name: "支出", amountType: "expense" }],
        data: [{ label: "食費", values: [-10_000] }],
      }).success,
    ).toBe(false);
  });
});
