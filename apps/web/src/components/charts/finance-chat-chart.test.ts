import { describe, expect, it } from "vitest";
import { semanticColors } from "../../lib/colors";
import { getFinanceChartSeriesColor } from "./finance-chat-chart";

describe("getFinanceChartSeriesColor", () => {
  it("uses the negative balance semantic for positive liability balances", () => {
    expect(
      getFinanceChartSeriesColor({ name: "負債", amountType: "liability" }, [20_000_000]),
    ).toBe(semanticColors.balanceNegative);
  });
});
