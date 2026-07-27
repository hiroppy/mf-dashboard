import { describe, it, expect } from "vitest";
import {
  getCategoryColor,
  getAssetCategoryColor,
  getChartColorArray,
  semanticColors,
} from "./colors";

describe("getCategoryColor", () => {
  it("既知の支出カテゴリの var() 参照を返す", () => {
    expect(getCategoryColor("食費")).toBe("var(--color-cat-food)");
  });

  it("既知の資産カテゴリの var() 参照を返す", () => {
    expect(getCategoryColor("投資信託")).toBe("var(--color-asset-fund)");
  });

  it("未知のカテゴリはデフォルトの var() 参照を返す", () => {
    expect(getCategoryColor("存在しないカテゴリ")).toBe("var(--color-cat-other)");
  });
});

describe("getAssetCategoryColor", () => {
  it("資産カテゴリの var() 参照を返す", () => {
    expect(getAssetCategoryColor("預金・現金")).toBe("var(--color-asset-deposit)");
    expect(getAssetCategoryColor("暗号資産")).toBe("var(--color-asset-crypto)");
    expect(getAssetCategoryColor("電子マネー・プリペイド")).toBe("var(--color-asset-prepaid)");
    expect(getAssetCategoryColor("ポイント")).toBe("var(--color-asset-point)");
  });
});

describe("getChartColorArray", () => {
  it("指定数の var() 参照配列を返す", () => {
    const colors = getChartColorArray(3);
    expect(colors).toHaveLength(3);
    expect(colors[0]).toBe("var(--color-chart-1)");
    expect(colors[1]).toBe("var(--color-chart-2)");
    expect(colors[2]).toBe("var(--color-chart-3)");
  });

  it("5より多い場合はループする", () => {
    const colors = getChartColorArray(7);
    expect(colors).toHaveLength(7);
    expect(colors[5]).toBe("var(--color-chart-1)");
  });
});

describe("semanticColors", () => {
  it("CSS var() 参照を返す", () => {
    expect(semanticColors.income).toBe("var(--color-income)");
    expect(semanticColors.expense).toBe("var(--color-expense)");
    expect(semanticColors.totalAssets).toBe("var(--color-total-assets)");
  });
});
