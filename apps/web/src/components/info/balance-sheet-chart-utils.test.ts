import { describe, expect, it } from "vitest";
import { sortBalanceSheetAssets } from "./balance-sheet-chart-utils";

describe("sortBalanceSheetAssets", () => {
  it("現行の主要カテゴリを指定順に並べる", () => {
    const assets = [
      { category: "暗号資産", amount: 50 },
      { category: "年金", amount: 400 },
      { category: "預金・現金", amount: 300 },
      { category: "株式(現物)", amount: 200 },
      { category: "投資信託", amount: 100 },
    ];

    expect(sortBalanceSheetAssets(assets).map(({ category }) => category)).toEqual([
      "投資信託",
      "株式(現物)",
      "預金・現金",
      "暗号資産",
      "年金",
    ]);
  });

  it("指定外カテゴリ同士は元の順番を維持する", () => {
    const assets = [
      { category: "年金", amount: 300 },
      { category: "保険", amount: 200 },
      { category: "ポイント", amount: 100 },
    ];

    expect(sortBalanceSheetAssets(assets)).toEqual(assets);
  });
});
