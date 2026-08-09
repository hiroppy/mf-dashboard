import { describe, expect, it } from "vitest";
import { holdingDefs } from "./holdings";
import { txTemplates } from "./transactions";

describe("demo holdings", () => {
  it("含み益と含み損の両方を含む", () => {
    const gains = holdingDefs
      .map((holding) => holding.unrealizedGain)
      .filter((gain): gain is number => gain !== undefined);

    expect(gains.some((gain) => gain > 0)).toBe(true);
    expect(gains.some((gain) => gain < 0)).toBe(true);
  });

  it("残高注意を確認できる銀行口座の残高と定期振替を含む", () => {
    const bankHolding = holdingDefs.find(({ accountName }) => accountName === "楽天銀行");
    const recurringTransfer = txTemplates.find(
      ({ description }) => description === "楽天銀行へ振替",
    );

    expect(bankHolding).toMatchObject({ amount: 200000 });
    expect(recurringTransfer).toMatchObject({ minAmount: 150000, maxAmount: 150000 });
    expect(bankHolding!.amount - recurringTransfer!.maxAmount).toBeLessThanOrEqual(100000);
  });
});
