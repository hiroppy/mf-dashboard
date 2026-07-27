import { describe, expect, it } from "vitest";
import { sortByAmountDescending } from "./amount-order";

describe("sortByAmountDescending", () => {
  it("有限金額を正数、ゼロ、負数の降順に並べる", () => {
    const items = [
      { name: "Zero", amount: 0 },
      { name: "Negative A", amount: -100 },
      { name: "Positive", amount: 200 },
      { name: "Negative B", amount: -20 },
    ];

    expect(
      sortByAmountDescending(
        items,
        (item) => item.amount,
        (item) => item.name,
      ).map((item) => item.name),
    ).toEqual(["Positive", "Zero", "Negative B", "Negative A"]);
  });

  it("欠損値と非有限値を末尾へ送り、同額はキー順にする", () => {
    const items = [
      { name: "Item 10", amount: null },
      { name: "Item 2", amount: Number.NaN },
      { name: "Category B", amount: 100 },
      { name: "Category A", amount: 100 },
      { name: "Missing", amount: undefined },
      { name: "Infinite", amount: Number.POSITIVE_INFINITY },
    ];

    expect(
      sortByAmountDescending(
        items,
        (item) => item.amount,
        (item) => item.name,
      ).map((item) => item.name),
    ).toEqual(["Category A", "Category B", "Infinite", "Item 2", "Item 10", "Missing"]);
  });

  it("入力配列を変更せず、金額とキーが同じ場合は元順を維持する", () => {
    const items = [
      { id: 1, key: "Same", amount: 100 },
      { id: 2, key: "Same", amount: 100 },
    ];

    const result = sortByAmountDescending(
      items,
      (item) => item.amount,
      (item) => item.key,
    );

    expect(result.map((item) => item.id)).toEqual([1, 2]);
    expect(result).not.toBe(items);
    expect(items.map((item) => item.id)).toEqual([1, 2]);
  });
});
