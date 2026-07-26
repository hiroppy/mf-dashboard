import { describe, expect, it } from "vitest";
import { calculateCompositionPercentage, createBreakdowns } from "./transaction-stats-utils";

const transaction = {
  date: "2026-01-01",
  description: null,
  accountName: null,
  category: null,
  subCategory: null,
} as const;

describe("createBreakdowns", () => {
  it("matches income by subcategory and expense by category", () => {
    const transactions = [
      {
        ...transaction,
        id: 1,
        amount: 200,
        type: "income" as const,
        category: "収入",
        subCategory: "給与",
      },
      {
        ...transaction,
        id: 2,
        amount: 100,
        type: "expense" as const,
        category: "食費",
        subCategory: "外食",
      },
    ];

    expect(createBreakdowns([{ name: "給与", value: 200 }], "income", transactions)).toMatchObject([
      { name: "給与", transactions: [{ id: 1, category: "給与" }] },
    ]);
    expect(createBreakdowns([{ name: "食費", value: 100 }], "expense", transactions)).toMatchObject(
      [{ name: "食費", transactions: [{ id: 2, category: "食費" }] }],
    );
  });

  it("uses その他 for missing categories", () => {
    const transactions = [
      { ...transaction, id: 1, amount: 100, type: "income" as const },
      { ...transaction, id: 2, amount: 50, type: "expense" as const },
    ];

    expect(
      createBreakdowns([{ name: "その他", value: 100 }], "income", transactions),
    ).toMatchObject([
      { name: "その他", categories: ["その他"], transactions: [{ id: 1, category: "その他" }] },
    ]);
    expect(
      createBreakdowns([{ name: "その他", value: 50 }], "expense", transactions),
    ).toMatchObject([
      { name: "その他", categories: ["その他"], transactions: [{ id: 2, category: "その他" }] },
    ]);
  });

  it("consolidates the sixth category into その他 with its transactions", () => {
    const categories = ["A", "B", "C", "D", "E", "F"].map((name, index) => ({
      name,
      value: 60 - index * 10,
    }));
    const transactions = categories.map((category, index) => ({
      ...transaction,
      id: index + 1,
      amount: category.value,
      type: "expense" as const,
      category: category.name,
    }));

    const result = createBreakdowns(categories, "expense", transactions);

    expect(result).toHaveLength(6);
    expect(result.at(-1)).toMatchObject({
      name: "その他",
      value: 10,
      categories: ["F"],
      transactions: [{ id: 6, category: "F" }],
    });
  });
});

describe("calculateCompositionPercentage", () => {
  it("returns zero when the total is zero", () => {
    expect(calculateCompositionPercentage(0, 0)).toBe(0);
  });

  it("calculates a percentage for a positive total", () => {
    expect(calculateCompositionPercentage(25, 100)).toBe(25);
  });
});
