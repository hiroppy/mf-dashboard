import type { Portfolio } from "@mf-dashboard/db/types";
import { describe, expect, test } from "vitest";
import { compareHoldingSummaries, summarizePortfolio } from "../src/compare/holdings";

describe("summarizePortfolio", () => {
  test("匿名のportfolioを比較用summaryへ変換する", () => {
    const portfolio: Portfolio = {
      totalAssets: 300,
      items: [
        { name: "Asset A", type: "deposit", institution: "Institution A", balance: 100 },
        { name: "Asset B", type: "fund", institution: "Institution B", balance: 200 },
      ],
    };

    expect(summarizePortfolio(portfolio)).toEqual({
      totalAssets: 300,
      items: [
        { name: "Asset A", amount: 100 },
        { name: "Asset B", amount: 200 },
      ],
    });
  });
});

describe("compareHoldingSummaries", () => {
  test("同名項目を合算し、総額差が閾値境界なら一致する", () => {
    const result = compareHoldingSummaries(
      {
        totalAssets: 400,
        items: [
          { name: "Asset A", amount: 100 },
          { name: "Asset A", amount: 200 },
        ],
      },
      {
        totalAssets: 500,
        items: [
          { name: "Asset A", amount: 150 },
          { name: "Asset A", amount: 150 },
        ],
      },
      100,
    );

    expect(result).toEqual({
      totalAssetsMatch: true,
      itemCountMatch: true,
      itemMatches: [{ name: "Asset A", scrapedAmount: 300, dbAmount: 300, matches: true }],
    });
  });

  test("閾値超過、件数差、片側だけの項目を不一致にする", () => {
    const result = compareHoldingSummaries(
      { totalAssets: 99, items: [{ name: "Asset A", amount: 99 }] },
      {
        totalAssets: 200,
        items: [
          { name: "Asset A", amount: 100 },
          { name: "Asset B", amount: 100 },
        ],
      },
      100,
    );

    expect(result).toEqual({
      totalAssetsMatch: false,
      itemCountMatch: false,
      itemMatches: [
        { name: "Asset A", scrapedAmount: 99, dbAmount: 100, matches: true },
        { name: "Asset B", scrapedAmount: null, dbAmount: 100, matches: false },
      ],
    });
  });
});
