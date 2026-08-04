import { describe, expect, it } from "vitest";
import {
  classifyRecurringTransaction,
  generateRecurringCandidates,
  matchesRecurringCandidateIdentity,
  type RecurringTransaction,
} from "./recurring-candidates";

const accountA = "account-a";

function transaction(
  date: string,
  amount: number,
  description: string,
  type: "income" | "expense" = "expense",
): RecurringTransaction {
  return { accountId: accountA, date, amount, description, type };
}

describe("classifyRecurringTransaction", () => {
  it.each([
    ["カード利用代金", "card"],
    ["家賃", "rent"],
    ["住宅ローン返済", "loan"],
    ["給与振込", "salary"],
    ["役員報酬", "executive_compensation"],
    ["所得税", "tax"],
    ["定期支払", "other"],
  ] as const)("classifies %s as %s", (description, expected) => {
    expect(classifyRecurringTransaction({ description })).toBe(expected);
  });

  it("uses structured categories", () => {
    expect(
      classifyRecurringTransaction({ category: "収入", subCategory: "給与", description: "振込" }),
    ).toBe("salary");
  });

  it("does not match English keyword substrings", () => {
    expect(classifyRecurringTransaction({ description: "Discarded item" })).toBe("other");
  });
});

describe("matchesRecurringCandidateIdentity", () => {
  it("matches descriptions after removing monthly reference numbers", () => {
    expect(
      matchesRecurringCandidateIdentity(
        { description: "UTILITY INVOICE 1002", recurringIdentity: "utility invoice" },
        { description: "UTILITY INVOICE 1003" },
      ),
    ).toBe(true);
  });

  it("uses categories when descriptions are missing", () => {
    expect(
      matchesRecurringCandidateIdentity(
        { description: null, recurringIdentity: "家賃categorysep" },
        { category: "家賃", description: null },
      ),
    ).toBe(true);
  });

  it("does not merge different descriptions", () => {
    expect(
      matchesRecurringCandidateIdentity(
        { description: "Service A", recurringIdentity: "service a" },
        { description: "Service B" },
      ),
    ).toBe(false);
  });
});

describe("generateRecurringCandidates", () => {
  it("forecasts consecutive monthly transactions", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-05-25", 300_000, "給与 5月", "income"),
        transaction("2026-06-24", 310_000, "給与 6月", "income"),
        transaction("2026-07-25", 305_000, "給与 7月", "income"),
        transaction("2026-06-27", 80_000, "家賃"),
        transaction("2026-07-28", 82_000, "家賃"),
      ],
      "2026-08",
    );

    expect(result).toMatchObject([
      {
        classification: "salary",
        predictedDate: "2026-08-25",
        predictedAmount: 305_000,
        evidence: { occurrenceCount: 3 },
      },
      {
        classification: "rent",
        predictedDate: "2026-08-28",
        predictedAmount: 82_000,
        evidence: { occurrenceCount: 2 },
      },
    ]);
  });

  it("allows variable amounts for the same monthly debit", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-05-05", 20_000, "定期購入代金"),
        transaction("2026-06-05", 80_000, "定期購入代金"),
        transaction("2026-07-06", 40_000, "定期購入代金"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({
      predictedDate: "2026-08-05",
      predictedAmount: 40_000,
      evidence: { amountRange: { min: 20_000, max: 80_000 } },
    });
  });

  it("does not forecast a stream that stopped or skipped a month", () => {
    expect(
      generateRecurringCandidates(
        [
          transaction("2026-04-10", 10_000, "Service"),
          transaction("2026-06-10", 10_000, "Service"),
        ],
        "2026-08",
      ),
    ).toEqual([]);
  });

  it("keeps the latest transaction per month regardless of input order", () => {
    const earlier = transaction("2026-07-05", 20_000, "Service");
    const latest = transaction("2026-07-25", 40_000, "Service");
    const history = [transaction("2026-06-20", 30_000, "Service")];

    expect(generateRecurringCandidates([...history, latest, earlier], "2026-08")).toEqual(
      generateRecurringCandidates([...history, earlier, latest], "2026-08"),
    );
    expect(generateRecurringCandidates([...history, latest, earlier], "2026-08")[0]).toMatchObject({
      predictedAmount: 40_000,
      predictedDate: "2026-08-23",
    });
  });

  it("keeps a structured salary after one occurrence", () => {
    const result = generateRecurringCandidates(
      [
        {
          ...transaction("2026-07-25", 300_000, "振込", "income"),
          category: "収入",
          subCategory: "給与",
        },
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ classification: "salary", predictedAmount: 300_000 });
  });

  it("does not forecast a one-off bonus after one occurrence", () => {
    expect(
      generateRecurringCandidates(
        [
          {
            ...transaction("2026-07-10", 500_000, "振込", "income"),
            category: "収入",
            subCategory: "賞与",
          },
        ],
        "2026-08",
      ),
    ).toEqual([]);
  });

  it("does not treat one unstructured transaction as recurring", () => {
    expect(
      generateRecurringCandidates(
        [transaction("2026-07-25", 300_000, "単発振込", "income")],
        "2026-08",
      ),
    ).toEqual([]);
  });

  it("ignores transfers, excluded transactions, and invalid amounts", () => {
    const base = transaction("2026-07-10", 10_000, "Service");
    expect(
      generateRecurringCandidates(
        [
          { ...base, type: "transfer" },
          { ...base, isTransfer: true },
          { ...base, isExcludedFromCalculation: true },
          { ...base, amount: Number.NaN },
          { ...base, amount: 0 },
        ],
        "2026-08",
      ),
    ).toEqual([]);
  });

  it("clamps month-end predictions", () => {
    const result = generateRecurringCandidates(
      [transaction("2025-12-31", 10_000, "Service"), transaction("2026-01-31", 10_000, "Service")],
      "2026-02",
    );
    expect(result[0]?.predictedDate).toBe("2026-02-28");
  });

  it("validates target months and options", () => {
    expect(() => generateRecurringCandidates([], "invalid")).toThrow(
      "Invalid year-month key: invalid",
    );
    expect(() => generateRecurringCandidates([], "2026-08", { lookbackMonths: 0 })).toThrow(
      "lookbackMonths must be a positive integer",
    );
  });
});
