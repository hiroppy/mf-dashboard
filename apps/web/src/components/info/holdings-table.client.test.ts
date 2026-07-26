import { describe, expect, it } from "vitest";
import { filterCategories } from "./holdings-table.client";

const categories = [
  {
    category: "株式(現物)",
    total: 600,
    items: [
      {
        id: 1,
        name: "銘柄 A",
        accountName: "証券口座 A",
        institution: "金融機関 A",
        categoryName: "株式(現物)",
        amount: 100,
        unrealizedGain: 10,
        unrealizedGainPct: 10,
        dailyChange: 1,
        avgCostPrice: 90,
        quantity: 1,
        unitPrice: 100,
      },
      {
        id: 2,
        name: "銘柄 B",
        accountName: "証券口座 B",
        institution: "金融機関 B",
        categoryName: "株式(現物)",
        amount: 500,
        unrealizedGain: 20,
        unrealizedGainPct: 4,
        dailyChange: 2,
        avgCostPrice: 480,
        quantity: 1,
        unitPrice: 500,
      },
    ],
  },
  {
    category: "投資信託",
    total: 200,
    items: [
      {
        id: 3,
        name: "投資信託 A",
        accountName: "証券口座 A",
        institution: "金融機関 A",
        categoryName: "投資信託",
        amount: 200,
        unrealizedGain: 30,
        unrealizedGainPct: 15,
        dailyChange: 3,
        avgCostPrice: 170,
        quantity: 1,
        unitPrice: 200,
      },
    ],
  },
];

describe("filterCategories", () => {
  it("全件選択では元のカテゴリを返す", () => {
    expect(filterCategories(categories, "__all__")).toBe(categories);
  });

  it("金融機関を選ぶと、その金融機関の保有資産と合計だけを返す", () => {
    expect(filterCategories(categories, "金融機関 A")).toEqual([
      {
        ...categories[0],
        items: [categories[0].items[0]],
        total: 100,
      },
      {
        ...categories[1],
        items: [categories[1].items[0]],
        total: 200,
      },
    ]);
  });

  it("金融機関と種別を選ぶと、該当するカテゴリだけを返す", () => {
    expect(filterCategories(categories, "金融機関 A|投資信託")).toEqual([
      {
        ...categories[1],
        items: [categories[1].items[0]],
        total: 200,
      },
    ]);
  });

  it("該当する保有資産がなければ空配列を返す", () => {
    expect(filterCategories(categories, "金融機関 C")).toEqual([]);
  });
});
