import { describe, expect, it } from "vitest";
import {
  generateBankForecastCandidates,
  projectRecurringCandidatesThroughDate,
} from "./bank-cashflow-forecast-candidates";

describe("generateBankForecastCandidates", () => {
  it("隔月候補を予定月の翌月へ繰り越さない", () => {
    const transactions = ["2026-02-16", "2026-04-16", "2026-06-16"].map((date, index) => ({
      id: index + 1,
      accountId: 1,
      transferTargetAccountId: null,
      date,
      amount: 10_000 + index * 1_000,
      type: "expense" as const,
      description: "水道料金",
      category: "水道・光熱費",
      subCategory: "水道代",
      isTransfer: false,
      isExcludedFromCalculation: false,
    }));

    expect(generateBankForecastCandidates(transactions, "2026-08")).toHaveLength(1);
    expect(generateBankForecastCandidates(transactions, "2026-09")).toEqual([]);
  });

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

  it("月末を丸めた後も元の周期日へ戻す", () => {
    const projected = projectRecurringCandidatesThroughDate(
      [
        {
          accountId: 1,
          type: "expense",
          classification: "other",
          description: "月末支払い",
          recurrenceIntervalMonths: 1,
          predictedDate: "2026-08-31",
          predictedAmount: 10_000,
          evidence: {
            occurrenceCount: 3,
            dateRange: { from: "2026-05-31", to: "2026-07-31" },
            amountRange: { min: 10_000, max: 10_000 },
          },
        },
      ],
      "2026-10-31",
    );

    expect(projected.map(({ predictedDate }) => predictedDate)).toEqual([
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
    ]);
  });
});
