import { describe, expect, test } from "vitest";
import { buildCategoryCandidates, type ExtractedCategoryCandidate } from "./category-candidates.js";

describe("buildCategoryCandidates", () => {
  test("標準・カスタム中カテゴリと収支種別を変換する", () => {
    const extracted: ExtractedCategoryCandidate[] = [
      {
        largeCategoryId: "1",
        largeCategoryName: "収入",
        middleCategoryId: "101",
        middleCategoryName: "Salary",
      },
      {
        largeCategoryId: "11",
        largeCategoryName: "Expense",
        middleCategoryId: "2001",
        middleCategoryName: "Custom item",
      },
    ];

    expect(buildCategoryCandidates(extracted)).toEqual([
      { ...extracted[0], isIncome: true },
      { ...extracted[1], isIncome: false },
    ]);
  });

  test.each([
    ["large category ID", { largeCategoryId: "" }],
    ["large category name", { largeCategoryName: "" }],
    ["middle category ID", { middleCategoryId: "" }],
    ["middle category name", { middleCategoryName: "" }],
  ])("空の%sを持つ項目を除外する", (_, override) => {
    const candidate = {
      largeCategoryId: "11",
      largeCategoryName: "Expense",
      middleCategoryId: "41",
      middleCategoryName: "Groceries",
      ...override,
    };

    expect(buildCategoryCandidates([candidate])).toEqual([]);
  });

  test("同じ大・中カテゴリIDの組を重複させない", () => {
    const candidate = {
      largeCategoryId: "11",
      largeCategoryName: "Expense",
      middleCategoryId: "41",
      middleCategoryName: "Groceries",
    };

    expect(buildCategoryCandidates([candidate, candidate])).toEqual([
      { ...candidate, isIncome: false },
    ]);
  });
});
