import { describe, expect, it } from "vitest";
import { holdingDefs } from "./holdings";

describe("demo holdings", () => {
  it("含み益と含み損の両方を含む", () => {
    const gains = holdingDefs
      .map((holding) => holding.unrealizedGain)
      .filter((gain): gain is number => gain !== undefined);

    expect(gains.some((gain) => gain > 0)).toBe(true);
    expect(gains.some((gain) => gain < 0)).toBe(true);
  });
});
