import { describe, expect, it } from "vitest";
import { accountDefs } from "./accounts";
import { holdingDefs } from "./holdings";

describe("demo holdings", () => {
  it("含み益と含み損の両方を含む", () => {
    const gains = holdingDefs
      .map((holding) => holding.unrealizedGain)
      .filter((gain): gain is number => gain !== undefined);

    expect(gains.some((gain) => gain > 0)).toBe(true);
    expect(gains.some((gain) => gain < 0)).toBe(true);
  });

  it("残高注意を確認できる銀行口座を1件含む", () => {
    const bankAccountNames = new Set(
      accountDefs.filter(({ categoryName }) => categoryName === "銀行").map(({ name }) => name),
    );
    const lowBalanceBankHoldings = holdingDefs.filter(
      ({ accountName, amount }) => bankAccountNames.has(accountName) && amount <= 100000,
    );

    expect(lowBalanceBankHoldings).toEqual([
      expect.objectContaining({ accountName: "楽天銀行", amount: 100000 }),
    ]);
  });
});
