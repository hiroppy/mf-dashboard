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

  it("rejects duplicate series names", () => {
    expect(
      financeChartSchema.safeParse({
        title: "口座比較",
        chartType: "bar",
        series: [
          { name: "口座 A", amountType: "balance" },
          { name: "口座 A", amountType: "balance" },
        ],
        data: [{ label: "7月", values: [100_000, 200_000] }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate data labels", () => {
    expect(
      financeChartSchema.safeParse({
        title: "口座比較",
        chartType: "bar",
        series: [{ name: "残高", amountType: "balance" }],
        data: [
          { label: "口座 A", values: [100_000] },
          { label: "口座 A", values: [200_000] },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts count and percentage units", () => {
    expect(
      financeChartSchema.safeParse({
        title: "取引件数",
        chartType: "bar",
        unit: "count",
        series: [{ name: "件数", amountType: "balance" }],
        data: [{ label: "7月", values: [12] }],
      }).success,
    ).toBe(true);
    expect(
      financeChartSchema.safeParse({
        title: "貯蓄率",
        chartType: "line",
        unit: "percent",
        series: [{ name: "貯蓄率", amountType: "balance" }],
        data: [{ label: "7月", values: [25] }],
      }).success,
    ).toBe(true);
  });
});
