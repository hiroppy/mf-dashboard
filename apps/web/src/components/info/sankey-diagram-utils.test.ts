import { describe, expect, it } from "vitest";
import { calculateFlowPercentage } from "./sankey-diagram-utils";

describe("calculateFlowPercentage", () => {
  it("赤字時は収入と赤字を総支出に対する割合として計算する", () => {
    const totalIncome = 52785;
    const totalExpense = 119305;
    const deficit = totalExpense - totalIncome;

    expect(calculateFlowPercentage(totalIncome, totalExpense)).toBe("44");
    expect(calculateFlowPercentage(deficit, totalExpense)).toBe("56");
  });

  it("黒字時は支出と黒字を総収入に対する割合として計算する", () => {
    const totalIncome = 300000;
    const totalExpense = 200000;
    const balance = totalIncome - totalExpense;

    expect(calculateFlowPercentage(totalIncome, totalIncome)).toBe("100");
    expect(calculateFlowPercentage(totalExpense, totalIncome)).toBe("67");
    expect(calculateFlowPercentage(balance, totalIncome)).toBe("33");
  });

  it("総フローがゼロの場合は0を返す", () => {
    expect(calculateFlowPercentage(0, 0)).toBe("0");
  });
});
