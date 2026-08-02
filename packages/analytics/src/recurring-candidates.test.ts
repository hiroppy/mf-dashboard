import { describe, expect, it } from "vitest";
import {
  classifyRecurringTransaction,
  generateRecurringCandidates,
  type RecurringTransaction,
} from "./recurring-candidates";

const accountA = "account-a";

function transaction(
  date: string,
  amount: number,
  description: string,
  type: "income" | "expense" = "expense",
  accountId: string | number = accountA,
): RecurringTransaction {
  return { accountId, date, amount, description, type };
}

describe("classifyRecurringTransaction", () => {
  it.each([
    ["カード利用代金", "card"],
    ["家賃", "rent"],
    ["住宅ローン返済", "loan"],
    ["カードローン返済", "loan"],
    ["給与振込", "salary"],
    ["役員報酬", "executive_compensation"],
    ["Executive compensation", "executive_compensation"],
    ["所得税 予定納税", "tax"],
    ["税・社会保障 / 所得税・住民税", "tax"],
    ["給与所得税", "tax"],
    ["Tax payment", "tax"],
    ["定期支払", "other"],
  ] as const)("classifies %s as %s", (description, expected) => {
    expect(classifyRecurringTransaction({ description })).toBe(expected);
  });

  it("uses category and subcategory when the description has no label", () => {
    expect(
      classifyRecurringTransaction({
        category: "収入",
        subCategory: "給与",
        description: "振込",
      }),
    ).toBe("salary");
  });

  it.each(["Taxi fare", "Current account", "Discarded item"])(
    "does not classify an English keyword substring in %s",
    (description) => {
      expect(classifyRecurringTransaction({ description })).toBe("other");
    },
  );
});

describe("generateRecurringCandidates", () => {
  it("creates only target-month events with confidence and evidence", () => {
    const transactions = [
      transaction("2026-05-25", 300_000, "給与 5月", "income"),
      transaction("2026-06-24", 310_000, "給与 6月", "income"),
      transaction("2026-07-25", 305_000, "給与 7月", "income"),
      transaction("2026-06-27", 80_000, "家賃"),
      transaction("2026-07-28", 82_000, "家賃"),
      transaction("2026-07-10", 150_000, "新規振込", "income"),
    ];

    expect(generateRecurringCandidates(transactions, "2026-08")).toEqual([
      {
        accountId: accountA,
        type: "income",
        classification: "other",
        confidence: "low",
        description: "新規振込",
        predictedDate: "2026-08-10",
        predictedAmount: 150_000,
        evidence: {
          lookbackMonths: 12,
          occurrenceCount: 1,
          dateRange: { from: "2026-07-10", to: "2026-07-10" },
          amountRange: { min: 150_000, max: 150_000 },
        },
      },
      {
        accountId: accountA,
        type: "income",
        classification: "salary",
        confidence: "high",
        description: "給与 7月",
        predictedDate: "2026-08-25",
        predictedAmount: 305_000,
        evidence: {
          lookbackMonths: 12,
          occurrenceCount: 3,
          dateRange: { from: "2026-05-25", to: "2026-07-25" },
          amountRange: { min: 300_000, max: 310_000 },
        },
      },
      {
        accountId: accountA,
        type: "expense",
        classification: "rent",
        confidence: "medium",
        description: "家賃",
        predictedDate: "2026-08-28",
        predictedAmount: 81_000,
        evidence: {
          lookbackMonths: 12,
          occurrenceCount: 2,
          dateRange: { from: "2026-06-27", to: "2026-07-28" },
          amountRange: { min: 80_000, max: 82_000 },
        },
      },
    ]);
  });

  it("absorbs date drift, description variants, and amounts within the configured band", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-05-31", 50_000, "Example CARD 2026-05"),
        transaction("2026-06-30", 52_000, "example-card-2026-06"),
        transaction("2026-07-29", 49_000, "ＥＸＡＭＰＬＥ ＣＡＲＤ ２０２６－０７"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      classification: "card",
      confidence: "high",
      predictedDate: "2026-08-30",
      predictedAmount: 50_000,
    });
  });

  it("fuzzy-matches descriptions that differ in their prefix", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-10", 20_000, "ACME UTILITY"),
        transaction("2026-07-10", 20_000, "XACME UTILITY"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ confidence: "medium" });
  });

  it("normalizes an explicit billing month that lags the posting month", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-30", 50_000, "カード利用代金 5月分"),
        transaction("2026-07-31", 50_000, "カード利用代金 6月分"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ classification: "card", confidence: "medium" });
  });

  it("normalizes non-zero-padded Western billing months", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-30", 50_000, "カード利用代金 2026-5"),
        transaction("2026-07-31", 50_000, "カード利用代金 2026/6"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ classification: "card", confidence: "medium" });
  });

  it("normalizes complete Western dates including their day suffix", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-05-30", 20_000, "UTILITY 2026-05-30"),
        transaction("2026-06-30", 20_000, "UTILITY 2026/06/30"),
        transaction("2026-07-31", 20_000, "UTILITY 2026.07.31"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ confidence: "high" });
  });

  it("normalizes complete Japanese dates including their day suffix", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-05-30", 20_000, "UTILITY 2026年5月30日"),
        transaction("2026-06-30", 20_000, "UTILITY 2026年6月30日"),
        transaction("2026-07-31", 20_000, "UTILITY 2026年7月31日"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ confidence: "high" });
  });

  it("matches complete Japanese month tokens without partial numeric matches", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-10", 20_000, "11月会費"),
        transaction("2026-02-10", 20_000, "11月会費"),
      ],
      "2026-03",
    );

    expect(result[0]).toMatchObject({ confidence: "medium", predictedDate: "2026-03-10" });
  });

  it("preserves Japanese identifiers with implausible years", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-05", 40_000, "CARD 1234年5月"),
        transaction("2026-07-05", 40_000, "CARD 1234年5月"),
        transaction("2026-06-05", 40_000, "CARD 9876年5月"),
        transaction("2026-07-05", 40_000, "CARD 9876年5月"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(2);
  });

  it("clips a month-end prediction to the target month's last day", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2025-11-30", 80_000, "家賃"),
        transaction("2025-12-31", 80_000, "家賃"),
        transaction("2026-01-31", 80_000, "家賃"),
      ],
      "2026-02",
    );

    expect(result[0]?.predictedDate).toBe("2026-02-28");
  });

  it("preserves an end-of-month schedule when the target month is longer", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-02-28", 80_000, "家賃"),
        transaction("2026-03-31", 80_000, "家賃"),
        transaction("2026-04-30", 80_000, "家賃"),
      ],
      "2026-05",
    );

    expect(result[0]?.predictedDate).toBe("2026-05-31");
  });

  it("matches exact month ends when date drift is zero", () => {
    const result = generateRecurringCandidates(
      [transaction("2026-02-28", 80_000, "家賃"), transaction("2026-03-31", 80_000, "家賃")],
      "2026-04",
      { dateDriftDays: 0 },
    );

    expect(result[0]).toMatchObject({ confidence: "medium", predictedDate: "2026-04-30" });
  });

  it("groups holiday drift that crosses a calendar-month boundary", () => {
    const result = generateRecurringCandidates(
      [transaction("2026-01-31", 80_000, "家賃"), transaction("2026-03-02", 80_000, "家賃")],
      "2026-04",
    );

    expect(result[0]).toMatchObject({ confidence: "medium", predictedDate: "2026-04-30" });
  });

  it("counts delayed boundary postings as separate scheduled occurrences", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-31", 80_000, "家賃"),
        transaction("2026-03-02", 80_000, "家賃"),
        transaction("2026-03-31", 80_000, "家賃"),
      ],
      "2026-04",
    );

    expect(result[0]).toMatchObject({
      confidence: "high",
      predictedDate: "2026-04-30",
      evidence: { occurrenceCount: 3 },
    });
  });

  it("keeps interleaved month-start and month-end streams separate", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-31", 80_000, "定期支払"),
        transaction("2026-02-02", 80_000, "定期支払"),
        transaction("2026-02-28", 80_000, "定期支払"),
        transaction("2026-03-02", 80_000, "定期支払"),
        transaction("2026-03-31", 80_000, "定期支払"),
        transaction("2026-04-02", 80_000, "定期支払"),
        transaction("2026-04-30", 80_000, "定期支払"),
      ],
      "2026-05",
    );

    expect(result).toHaveLength(2);
    expect(result.map(({ predictedDate }) => predictedDate)).toEqual(["2026-05-02", "2026-05-31"]);
  });

  it("keeps interleaved streams separate after a delayed boundary posting", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-31", 80_000, "定期支払"),
        transaction("2026-03-02", 80_000, "定期支払"),
        transaction("2026-03-31", 80_000, "定期支払"),
        transaction("2026-04-02", 80_000, "定期支払"),
        transaction("2026-04-30", 80_000, "定期支払"),
        transaction("2026-05-02", 80_000, "定期支払"),
        transaction("2026-05-31", 80_000, "定期支払"),
      ],
      "2026-06",
    );

    expect(result).toHaveLength(2);
    expect(result.map(({ predictedDate }) => predictedDate)).toEqual(["2026-06-02", "2026-06-30"]);
  });

  it("does not force ordinary dates to month-end with a large drift option", () => {
    const result = generateRecurringCandidates(
      [transaction("2026-06-15", 80_000, "家賃"), transaction("2026-07-15", 80_000, "家賃")],
      "2026-08",
      { dateDriftDays: 15 },
    );

    expect(result[0]?.predictedDate).toBe("2026-08-15");
  });

  it("does not group cross-boundary dates outside the boundary window", () => {
    expect(
      generateRecurringCandidates(
        [transaction("2026-06-30", 80_000, "家賃"), transaction("2026-07-04", 80_000, "家賃")],
        "2026-08",
        { dateDriftDays: 5 },
      ),
    ).toEqual([]);
  });

  it("bounds incremental drift around a stable group center", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-01", 20_000, "定期支払"),
        transaction("2026-02-04", 20_000, "定期支払"),
        transaction("2026-03-07", 20_000, "定期支払"),
        transaction("2026-04-10", 20_000, "定期支払"),
      ],
      "2026-05",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ confidence: "medium", predictedDate: "2026-05-09" });
  });

  it("does not merge inverse month-start and month-end schedules", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-01", 80_000, "定期支払"),
        transaction("2026-01-31", 80_000, "定期支払"),
        transaction("2026-02-01", 80_000, "定期支払"),
        transaction("2026-02-28", 80_000, "定期支払"),
      ],
      "2026-03",
    );

    expect(result).toHaveLength(2);
    expect(result.map(({ predictedDate }) => predictedDate)).toEqual(["2026-03-01", "2026-03-31"]);
  });

  it("uses only the preceding 12 months and ignores the target month and future", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2025-07-15", 20_000, "ローン"),
        transaction("2026-06-15", 20_000, "ローン"),
        transaction("2026-07-15", 20_000, "ローン"),
        transaction("2026-08-15", 20_000, "ローン"),
        transaction("2026-09-15", 20_000, "ローン"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({
      confidence: "medium",
      evidence: {
        occurrenceCount: 2,
        dateRange: { from: "2026-06-15", to: "2026-07-15" },
      },
    });
  });

  it("does not forecast a non-monthly cadence in the target month", () => {
    expect(
      generateRecurringCandidates(
        [
          transaction("2026-01-10", 120_000, "予定納税"),
          transaction("2026-04-10", 120_000, "予定納税"),
          transaction("2026-07-10", 120_000, "予定納税"),
        ],
        "2026-08",
      ),
    ).toEqual([]);
  });

  it("does not count multiple matching transactions in one month as recurring months", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-10", 120_000, "予定納税"),
        transaction("2026-06-11", 120_000, "予定納税"),
        transaction("2026-07-10", 120_000, "予定納税"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({
      classification: "tax",
      confidence: "medium",
      evidence: { occurrenceCount: 2 },
    });
  });

  it("preserves repeated ordinary schedules within each month", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-10", 20_000, "SERVICE PLAN"),
        transaction("2026-01-12", 20_000, "SERVICE PLAN"),
        transaction("2026-02-10", 20_000, "SERVICE PLAN"),
        transaction("2026-02-12", 20_000, "SERVICE PLAN"),
        transaction("2026-03-10", 20_000, "SERVICE PLAN"),
        transaction("2026-03-12", 20_000, "SERVICE PLAN"),
      ],
      "2026-04",
    );

    expect(result).toHaveLength(2);
    expect(result.map(({ predictedDate }) => predictedDate)).toEqual(["2026-04-10", "2026-04-12"]);
  });

  it("weights each month once when grouping around the median day", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-05-10", 120_000, "予定納税"),
        transaction("2026-06-13", 120_000, "予定納税"),
        transaction("2026-06-13", 120_000, "予定納税"),
        transaction("2026-06-13", 120_000, "予定納税"),
        transaction("2026-07-09", 120_000, "予定納税"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({
      confidence: "high",
      predictedDate: "2026-08-10",
      evidence: { occurrenceCount: 3 },
    });
  });

  it("selects same-day monthly representatives independently of input order", () => {
    const history = [
      transaction("2026-06-10", 100_000, "予定納税"),
      transaction("2026-06-10", 110_000, "予定納税"),
      transaction("2026-07-10", 110_000, "予定納税"),
    ];

    const forward = generateRecurringCandidates(history, "2026-08");
    const reversed = generateRecurringCandidates([...history].reverse(), "2026-08");
    expect(forward).toEqual(reversed);
    expect(forward[0]).toMatchObject({
      predictedAmount: 105_000,
      evidence: { amountRange: { min: 100_000, max: 110_000 } },
    });
  });

  it("keeps accounts and materially different patterns separate", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-05", 40_000, "カード A"),
        transaction("2026-07-05", 40_000, "カード A"),
        transaction("2026-06-05", 40_000, "カード A", "expense", "account-b"),
        transaction("2026-07-05", 40_000, "カード A", "expense", "account-b"),
        transaction("2026-06-20", 80_000, "カード B"),
        transaction("2026-07-20", 80_000, "カード B"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(3);
    expect(result.map(({ accountId }) => accountId)).toEqual([accountA, "account-b", accountA]);
  });

  it("assigns a transaction to the closest compatible schedule", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-10", 20_000, "定期支払"),
        transaction("2026-01-14", 20_000, "定期支払"),
        transaction("2026-02-10", 20_000, "定期支払"),
        transaction("2026-02-14", 20_000, "定期支払"),
        transaction("2026-03-13", 20_000, "定期支払"),
      ],
      "2026-04",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ confidence: "high", predictedDate: "2026-04-14" });
  });

  it("compares fuzzy descriptions against the full group history", () => {
    const label = "abcdefghijklmnopqrst";
    const history = Array.from({ length: 9 }, (_, index) =>
      transaction(
        `2026-${String(index + 1).padStart(2, "0")}-10`,
        20_000,
        label.slice(0, label.length - index),
      ),
    );

    const result = generateRecurringCandidates(history, "2026-10");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ confidence: "medium", evidence: { occurrenceCount: 2 } });
  });

  it("orders numeric and string account IDs independently of input order", () => {
    const history = [
      transaction("2026-06-05", 80_000, "家賃", "expense", 1),
      transaction("2026-07-05", 80_000, "家賃", "expense", 1),
      transaction("2026-06-05", 80_000, "家賃", "expense", "1"),
      transaction("2026-07-05", 80_000, "家賃", "expense", "1"),
    ];

    const accountIds = (transactions: RecurringTransaction[]) =>
      generateRecurringCandidates(transactions, "2026-08").map(({ accountId }) => accountId);
    expect(accountIds(history)).toEqual([1, "1"]);
    expect(accountIds([...history].reverse())).toEqual([1, "1"]);
  });

  it("does not merge card payments distinguished by stable numeric identifiers", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-05", 40_000, "CARD 6"),
        transaction("2026-07-05", 40_000, "CARD 6"),
        transaction("2026-06-05", 40_000, "CARD 7"),
        transaction("2026-07-05", 40_000, "CARD 7"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(2);
  });

  it("does not fuzzy-match long descriptions with different numeric identifiers", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-05", 40_000, "EXAMPLE MEMBERSHIP CARD 1"),
        transaction("2026-07-05", 40_000, "EXAMPLE MEMBERSHIP CARD 1"),
        transaction("2026-06-05", 40_000, "EXAMPLE MEMBERSHIP CARD 2"),
        transaction("2026-07-05", 40_000, "EXAMPLE MEMBERSHIP CARD 2"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(2);
  });

  it("requires exact identity at the maximum description threshold", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-05", 40_000, "CARD ABACA"),
        transaction("2026-07-05", 40_000, "CARD ABACA"),
        transaction("2026-06-05", 40_000, "CARD ACABA"),
        transaction("2026-07-05", 40_000, "CARD ACABA"),
      ],
      "2026-08",
      { descriptionSimilarityThreshold: 1 },
    );

    expect(result).toHaveLength(2);
  });

  it("preserves boundaries between stable numeric tokens", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-05", 40_000, "CARD 1-23"),
        transaction("2026-07-05", 40_000, "CARD 1-23"),
        transaction("2026-06-05", 40_000, "CARD 12-3"),
        transaction("2026-07-05", 40_000, "CARD 12-3"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(2);
  });

  it("preserves standalone six-digit identifiers", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-05", 40_000, "CARD 123405"),
        transaction("2026-07-05", 40_000, "CARD 123405"),
        transaction("2026-06-05", 40_000, "CARD 987605"),
        transaction("2026-07-05", 40_000, "CARD 987605"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(2);
  });

  it("preserves separated identifiers with implausible years", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-05", 40_000, "CARD 1234-05"),
        transaction("2026-07-05", 40_000, "CARD 1234-05"),
        transaction("2026-06-05", 40_000, "CARD 9876-05"),
        transaction("2026-07-05", 40_000, "CARD 9876-05"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(2);
  });

  it("normalizes recognized volatile numeric references", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-05", 20_000, "UTILITY INVOICE 1001"),
        transaction("2026-07-05", 20_000, "UTILITY INVOICE 1002"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ confidence: "medium" });
  });

  it("normalizes punctuation before volatile numeric references", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-05", 20_000, "UTILITY INVOICE NO: 1001"),
        transaction("2026-07-05", 20_000, "UTILITY INVOICE NO: 1002"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ confidence: "medium" });
  });

  it("uses categories to keep empty-description streams separate", () => {
    const history: RecurringTransaction[] = [
      {
        accountId: accountA,
        date: "2026-06-10",
        amount: 20_000,
        type: "expense",
        category: "Food",
      },
      {
        accountId: accountA,
        date: "2026-07-10",
        amount: 20_000,
        type: "expense",
        category: "Household",
      },
    ];

    expect(generateRecurringCandidates(history, "2026-08")).toEqual([]);
  });

  it("does not group transactions with entirely blank identities", () => {
    const history: RecurringTransaction[] = [
      { accountId: accountA, date: "2026-06-10", amount: 20_000, type: "expense" },
      { accountId: accountA, date: "2026-07-10", amount: 20_000, type: "expense" },
    ];

    expect(generateRecurringCandidates(history, "2026-08")).toEqual([]);
  });

  it("does not group a generic description without a category identity", () => {
    expect(
      generateRecurringCandidates(
        [
          transaction("2026-06-10", 20_000, "Payment"),
          transaction("2026-07-10", 20_000, "Payment"),
        ],
        "2026-08",
      ),
    ).toEqual([]);
  });

  it("skips many unmatchable blank identities", () => {
    const history: RecurringTransaction[] = Array.from({ length: 2_000 }, (_, index) => ({
      accountId: accountA,
      date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
      amount: 20_000,
      type: "expense",
    }));

    expect(generateRecurringCandidates(history, "2026-08")).toEqual([]);
  });

  it("uses categories to separate generic nonempty descriptions", () => {
    const history: RecurringTransaction[] = [
      {
        ...transaction("2026-06-10", 20_000, "Payment"),
        category: "Food",
      },
      {
        ...transaction("2026-07-10", 20_000, "Payment"),
        category: "Household",
      },
    ];

    expect(generateRecurringCandidates(history, "2026-08")).toEqual([]);
  });

  it("preserves category and subcategory tuple boundaries", () => {
    const history: RecurringTransaction[] = [
      {
        ...transaction("2026-06-10", 20_000, "Payment"),
        category: "A",
        subCategory: "BC",
      },
      {
        ...transaction("2026-06-10", 20_000, "Payment"),
        category: "AB",
        subCategory: "C",
      },
      {
        ...transaction("2026-07-10", 20_000, "Payment"),
        category: "A",
        subCategory: "BC",
      },
      {
        ...transaction("2026-07-10", 20_000, "Payment"),
        category: "AB",
        subCategory: "C",
      },
    ];

    expect(generateRecurringCandidates(history, "2026-08")).toHaveLength(2);
  });

  it("handles many distinct description partitions", () => {
    const history = Array.from({ length: 2_000 }, (_, index) => {
      const prefix = Array.from({ length: 4 }, (__, position) =>
        String.fromCharCode(97 + (Math.floor(index / 26 ** position) % 26)),
      ).join("");
      return transaction("2026-07-10", 20_000, `${prefix} merchant`);
    });

    expect(generateRecurringCandidates(history, "2026-08")).toEqual([]);
  });

  it("excludes transfers, empty amounts, small one-offs, and older one-off income", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-07-01", 0, "給与", "income"),
        transaction("2026-07-02", 99_999, "単発入金", "income"),
        transaction("2026-06-03", 200_000, "以前の単発入金", "income"),
        { ...transaction("2026-07-04", 200_000, "口座振替", "income"), type: "transfer" },
        {
          ...transaction("2026-06-05", 80_000, "家賃"),
          isExcludedFromCalculation: true,
        },
        {
          ...transaction("2026-07-05", 80_000, "家賃"),
          isExcludedFromCalculation: true,
        },
        { ...transaction("2026-06-06", 20_000, "ローン"), isTransfer: true },
        { ...transaction("2026-07-06", 20_000, "ローン"), isTransfer: true },
      ],
      "2026-08",
    );

    expect(result).toEqual([]);
  });

  it("returns a recent one-off large salary as a low-confidence candidate", () => {
    expect(
      generateRecurringCandidates(
        [transaction("2026-07-25", 300_000, "新規給与", "income")],
        "2026-08",
      )[0],
    ).toMatchObject({ classification: "salary", confidence: "low" });
  });

  it("does not forecast a recurring stream that stopped before the previous month", () => {
    expect(
      generateRecurringCandidates(
        [transaction("2025-09-10", 80_000, "家賃"), transaction("2025-10-10", 80_000, "家賃")],
        "2026-08",
      ),
    ).toEqual([]);
  });

  it("detects the month-boundary schedule from the active monthly suffix", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-31", 80_000, "定期支払"),
        transaction("2026-06-02", 80_000, "定期支払"),
        transaction("2026-07-02", 80_000, "定期支払"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ confidence: "medium", predictedDate: "2026-08-02" });
  });

  it("orders null and non-null descriptions deterministically", () => {
    const history: RecurringTransaction[] = [
      {
        accountId: accountA,
        date: "2026-06-10",
        amount: 20_000,
        type: "expense",
        category: "Membership",
      },
      transaction("2026-06-10", 20_000, "家賃"),
      {
        accountId: accountA,
        date: "2026-07-10",
        amount: 20_000,
        type: "expense",
        category: "Membership",
      },
      transaction("2026-07-10", 20_000, "家賃"),
    ];

    const descriptions = (transactions: RecurringTransaction[]) =>
      generateRecurringCandidates(transactions, "2026-08").map(({ description }) => description);
    expect(descriptions(history)).toEqual([null, "家賃"]);
    expect(descriptions([...history].reverse())).toEqual([null, "家賃"]);
  });

  it("orders canonically equivalent descriptions independently of input order", () => {
    const history = [
      transaction("2026-06-10", 20_000, "é"),
      transaction("2026-07-10", 20_000, "é"),
      transaction("2026-07-10", 20_000, "é"),
    ];

    expect(generateRecurringCandidates(history, "2026-08")).toEqual(
      generateRecurringCandidates([...history].reverse(), "2026-08"),
    );
  });

  it("returns an empty list for empty input", () => {
    expect(generateRecurringCandidates([], "2026-08")).toEqual([]);
  });

  it("supports a shorter lookback without allowing a window over 12 months", () => {
    const history = [
      transaction("2026-05-15", 20_000, "ローン"),
      transaction("2026-06-15", 20_000, "ローン"),
      transaction("2026-07-15", 20_000, "ローン"),
    ];

    expect(generateRecurringCandidates(history, "2026-08", { lookbackMonths: 2 })[0]).toMatchObject(
      {
        confidence: "medium",
        evidence: { lookbackMonths: 2, occurrenceCount: 2 },
      },
    );
    expect(() => generateRecurringCandidates(history, "2026-08", { lookbackMonths: 13 })).toThrow(
      "lookbackMonths must be an integer between 1 and 12",
    );
  });
});
