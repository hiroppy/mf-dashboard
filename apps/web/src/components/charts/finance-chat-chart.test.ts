import { describe, expect, it } from "vitest";
import { semanticColors } from "../../lib/colors";
import { getFinanceChartLineStroke, getFinanceChartSeriesColor } from "./finance-chat-chart";

describe("getFinanceChartSeriesColor", () => {
  it("uses the negative balance semantic for positive liability balances", () => {
    expect(
      getFinanceChartSeriesColor({ name: "負債", amountType: "liability" }, [20_000_000]),
    ).toBe(semanticColors.balanceNegative);
  });

  it("uses the negative balance semantic when balance values are negative or zero", () => {
    expect(getFinanceChartSeriesColor({ name: "残高", amountType: "balance" }, [-10_000, 0])).toBe(
      semanticColors.balanceNegative,
    );
  });
});

describe("getFinanceChartLineStroke", () => {
  it("uses a gradient only for mixed-sign balance values", () => {
    expect(
      getFinanceChartLineStroke(
        { name: "残高", amountType: "balance" },
        [10_000, -5_000],
        "balance-gradient",
      ),
    ).toBe("url(#balance-gradient)");
  });

  it("keeps mixed-sign liability values on the negative balance semantic", () => {
    expect(
      getFinanceChartLineStroke(
        { name: "負債", amountType: "liability" },
        [10_000, -5_000],
        "unused-gradient",
      ),
    ).toBe(semanticColors.balanceNegative);
  });
});
