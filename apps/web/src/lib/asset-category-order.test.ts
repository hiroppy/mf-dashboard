import { describe, expect, it } from "vitest";
import { getAssetCategoryStackOrder, sortAssetCategories } from "./asset-category-order";

describe("sortAssetCategories", () => {
  it("現行の主要カテゴリを指定順に並べる", () => {
    const assets = [
      { category: "預金・現金", amount: 300 },
      { category: "暗号資産", amount: 50 },
      { category: "年金", amount: 400 },
      { category: "株式(現物)", amount: 200 },
      { category: "投資信託", amount: 100 },
    ];

    expect(sortAssetCategories(assets).map(({ category }) => category)).toEqual([
      "投資信託",
      "株式(現物)",
      "暗号資産",
      "預金・現金",
      "年金",
    ]);
  });

  it("指定外カテゴリ同士は元の順番を維持する", () => {
    const assets = [
      { category: "年金", amount: 300 },
      { category: "保険", amount: 200 },
      { category: "ポイント", amount: 100 },
    ];

    expect(sortAssetCategories(assets)).toEqual(assets);
  });

  it("積み上げグラフは画面上の上から指定順になるよう逆順で描画する", () => {
    expect(
      getAssetCategoryStackOrder(["投資信託", "株式(現物)", "暗号資産", "預金・現金"]),
    ).toEqual(["預金・現金", "暗号資産", "株式(現物)", "投資信託"]);
  });
});
