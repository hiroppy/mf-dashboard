import { describe, expect, it } from "vitest";
import { generateBankForecastCandidates } from "./bank-cashflow-forecast-candidates";

describe("generateBankForecastCandidates", () => {
  it("一度だけ記録された給与を、翌月に未記録だった後まで繰り越さない", () => {
    const candidates = generateBankForecastCandidates(
      [
        {
          id: 1,
          accountId: 1,
          transferTargetAccountId: null,
          date: "2026-06-25",
          amount: 300_000,
          type: "income",
          description: "給与振込",
          category: "収入",
          subCategory: "給与",
          isTransfer: false,
          isExcludedFromCalculation: false,
        },
      ],
      "2026-08",
    );

    expect(candidates).toEqual([]);
  });
});
