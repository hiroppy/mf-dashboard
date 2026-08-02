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
      predictedDate: "2026-08-31",
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

  it("falls back to fuzzy groups when exact-label amount candidates do not match", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-10", 20_000, "ACME UTILITY"),
        transaction("2026-06-20", 20_000, "XACME UTILITY"),
        transaction("2026-07-10", 20_000, "XACME UTILITY"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ confidence: "medium", predictedDate: "2026-08-10" });
  });

  it("ranks fuzzy and exact-description candidates by their complete match score", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-10", 20_000, "ACME UTILITY"),
        transaction("2026-06-11", 20_000, "XACME UTILITY"),
        transaction("2026-07-10", 20_000, "XACME UTILITY"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ confidence: "medium", predictedDate: "2026-08-10" });
  });

  it("ranks a fuzzy group beyond the bounded amount bucket", () => {
    const stale = Array.from({ length: 8 }, (_, index) =>
      transaction("2026-01-10", 20_000, `${String.fromCharCode(98 + index)}ACME UTILITY`),
    );
    const result = generateRecurringCandidates(
      [
        ...stale,
        transaction("2026-05-10", 20_000, "ACME UTILITY"),
        transaction("2026-06-10", 20_000, "ACME UTILITY"),
        transaction("2026-07-10", 20_000, "XACME UTILITY"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ confidence: "high", evidence: { occurrenceCount: 3 } });
  });

  it("ignores stale fuzzy groups before applying the candidate limit", () => {
    const stale = Array.from({ length: 64 }, (_, index) => {
      const prefix = String.fromCharCode(97 + Math.floor(index / 26), 97 + (index % 26));
      return transaction("2026-01-10", 20_000, `${prefix}ACME UTILITY`);
    });
    const result = generateRecurringCandidates(
      [
        ...stale,
        transaction("2026-05-10", 20_000, "ACME UTILITY"),
        transaction("2026-06-10", 20_000, "ACME UTILITY"),
        transaction("2026-07-10", 20_000, "XACME UTILITY"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ confidence: "high", evidence: { occurrenceCount: 3 } });
  });

  it("ignores dissimilar fuzzy groups before applying the candidate limit", () => {
    const decoys = Array.from({ length: 64 }, (_, index) => {
      const unique = String.fromCodePoint(0x4e00 + index).repeat(12);
      return transaction("2026-06-10", 20_000, `za${unique}ab${unique}ba`);
    });
    const result = generateRecurringCandidates(
      [
        transaction("2026-05-10", 20_000, "zabab"),
        ...decoys,
        transaction("2026-06-10", 20_000, "zabab"),
        transaction("2026-07-10", 20_000, "zaba"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      confidence: "high",
      description: "zaba",
      evidence: { occurrenceCount: 3 },
    });
  });

  it("prefers a consecutive fuzzy group over a stale exact-description group", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-10", 20_000, "XACME UTILITY"),
        transaction("2026-06-14", 20_000, "ACME UTILITY"),
        transaction("2026-07-12", 20_000, "XACME UTILITY"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ confidence: "medium", predictedDate: "2026-08-13" });
  });

  it("starts a new group after a stale cadence gap", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-10", 100, "Utilities"),
        transaction("2026-06-10", 110, "Utilities"),
        transaction("2026-07-10", 121, "Utilities"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ confidence: "medium", evidence: { occurrenceCount: 2 } });
  });

  it("preserves fuzzy-matching labels that recur in parallel", () => {
    const result = generateRecurringCandidates(
      ["2026-01-10", "2026-02-10", "2026-03-10"].flatMap((date) => [
        transaction(date, 20_000, "ACME UTILITY"),
        transaction(date, 20_000, "XACME UTILITY"),
      ]),
      "2026-04",
    );

    expect(result).toHaveLength(2);
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

  it("normalizes valid compact full dates but preserves invalid numeric identifiers", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-30", 50_000, "CARD 20260630"),
        transaction("2026-07-31", 50_000, "CARD 20260731"),
        transaction("2026-06-10", 20_000, "SERVICE 20260230"),
        transaction("2026-07-10", 20_000, "SERVICE 20260231"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ classification: "card", confidence: "medium" });
  });

  it("normalizes valid separated full dates but preserves impossible dates", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-30", 50_000, "CARD 2026-06-30"),
        transaction("2026-07-31", 50_000, "CARD 2026/07/31"),
        transaction("2026-06-10", 20_000, "SERVICE 2026-02-30"),
        transaction("2026-07-10", 20_000, "SERVICE 2026-02-31"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ classification: "card", confidence: "medium" });
  });

  it("normalizes valid Japanese full dates but preserves impossible dates", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-30", 50_000, "CARD 2026年6月30日"),
        transaction("2026-07-31", 50_000, "CARD 2026年7月31日"),
        transaction("2026-06-10", 20_000, "SERVICE 2026年2月30日"),
        transaction("2026-07-10", 20_000, "SERVICE 2026年2月31日"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ classification: "card", confidence: "medium" });
  });

  it("normalizes valid yearless Japanese dates but preserves impossible dates", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-30", 50_000, "CARD 2月28日"),
        transaction("2026-07-31", 50_000, "CARD 2月29日"),
        transaction("2026-06-10", 20_000, "SERVICE 2月30日"),
        transaction("2026-07-10", 20_000, "SERVICE 2月31日"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(1);
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

  it("keeps the closest same-month occurrence for an existing schedule", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-10", 20_000, "SERVICE PLAN"),
        transaction("2026-07-07", 20_000, "SERVICE PLAN"),
        transaction("2026-07-10", 20_000, "SERVICE PLAN"),
      ],
      "2026-08",
    );

    expect(result[0]).toMatchObject({
      confidence: "medium",
      predictedDate: "2026-08-10",
      evidence: { occurrenceCount: 2 },
    });
  });

  it("reassigns a displaced same-month occurrence to another schedule", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-10", 20_000, "SERVICE PLAN"),
        transaction("2026-06-13", 20_000, "SERVICE PLAN"),
        transaction("2026-07-12", 20_000, "SERVICE PLAN"),
        transaction("2026-07-13", 20_000, "SERVICE PLAN"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(2);
    expect(result.map(({ predictedDate }) => predictedDate)).toEqual(["2026-08-11", "2026-08-13"]);
  });

  it("reprocesses displaced occurrences before transactions from later months", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-05-10", 20_000, "SERVICE PLAN"),
        transaction("2026-05-13", 20_000, "SERVICE PLAN"),
        transaction("2026-06-12", 20_000, "SERVICE PLAN"),
        transaction("2026-06-13", 20_000, "SERVICE PLAN"),
        transaction("2026-07-10", 20_000, "SERVICE PLAN"),
        transaction("2026-07-13", 20_000, "SERVICE PLAN"),
      ],
      "2026-08",
      { dateDriftDays: 2 },
    );

    expect(result).toHaveLength(2);
    expect(result.map(({ predictedDate }) => predictedDate)).toEqual(["2026-08-10", "2026-08-13"]);
  });

  it("matches near-end dates by their month-end offsets", () => {
    const result = generateRecurringCandidates(
      [transaction("2026-01-31", 80_000, "家賃"), transaction("2026-02-27", 80_000, "家賃")],
      "2026-03",
    );

    expect(result[0]).toMatchObject({ confidence: "medium", predictedDate: "2026-03-30" });
  });

  it("prefers a stable day-of-month over month-end offsets", () => {
    const result = generateRecurringCandidates(
      [transaction("2026-01-28", 80_000, "家賃"), transaction("2026-02-28", 80_000, "家賃")],
      "2026-03",
    );

    expect(result[0]).toMatchObject({ confidence: "medium", predictedDate: "2026-03-28" });
  });

  it("restores a fixed calendar day after a shorter month clips it", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-30", 80_000, "家賃"),
        transaction("2026-02-28", 80_000, "家賃"),
        transaction("2026-03-30", 80_000, "家賃"),
      ],
      "2026-04",
    );

    expect(result[0]).toMatchObject({ confidence: "high", predictedDate: "2026-04-30" });
  });

  it("groups a fixed calendar day clipped by a shorter month when drift is zero", () => {
    const result = generateRecurringCandidates(
      [transaction("2026-01-30", 80_000, "家賃"), transaction("2026-02-28", 80_000, "家賃")],
      "2026-03",
      { dateDriftDays: 0 },
    );

    expect(result[0]).toMatchObject({ confidence: "medium", predictedDate: "2026-03-30" });
  });

  it("groups stable calendar days when date drift is zero", () => {
    const result = generateRecurringCandidates(
      [transaction("2026-01-28", 80_000, "家賃"), transaction("2026-02-28", 80_000, "家賃")],
      "2026-03",
      { dateDriftDays: 0 },
    );

    expect(result[0]).toMatchObject({ confidence: "medium", predictedDate: "2026-03-28" });
  });

  it("groups holiday drift that crosses a calendar-month boundary", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2025-12-31", 80_000, "家賃"),
        transaction("2026-02-02", 80_000, "家賃"),
        transaction("2026-02-28", 80_000, "家賃"),
      ],
      "2026-03",
    );

    expect(result[0]).toMatchObject({ confidence: "high", predictedDate: "2026-03-31" });
  });

  it("does not treat a delayed posting as the latest scheduled boundary occurrence", () => {
    expect(
      generateRecurringCandidates(
        [transaction("2026-01-31", 80_000, "家賃"), transaction("2026-03-02", 80_000, "家賃")],
        "2026-04",
      ),
    ).toEqual([]);
  });

  it("groups consecutive boundary occurrences posted in the same calendar month", () => {
    const result = generateRecurringCandidates(
      [transaction("2026-02-02", 80_000, "家賃"), transaction("2026-02-28", 80_000, "家賃")],
      "2026-03",
    );

    expect(result[0]).toMatchObject({ confidence: "medium", predictedDate: "2026-03-31" });
  });

  it("retains separate boundary occurrences posted in the same calendar month", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-30", 80_000, "家賃"),
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

  it("uses boundary occurrence months when matching amount drift", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-31", 100, "定期支払"),
        transaction("2026-03-02", 110, "定期支払"),
        transaction("2026-03-31", 115, "定期支払"),
        transaction("2026-04-30", 120, "定期支払"),
      ],
      "2026-05",
    );

    expect(result[0]).toMatchObject({ confidence: "high", evidence: { occurrenceCount: 4 } });
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
      predictedAmount: 110_000,
      evidence: { amountRange: { min: 110_000, max: 110_000 } },
    });
  });

  it("preserves same-day recurring amount schedules", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-10", 10_000, "SERVICE PLAN"),
        transaction("2026-01-10", 10_500, "SERVICE PLAN"),
        transaction("2026-02-10", 10_000, "SERVICE PLAN"),
        transaction("2026-02-10", 10_500, "SERVICE PLAN"),
        transaction("2026-03-10", 10_000, "SERVICE PLAN"),
        transaction("2026-03-10", 10_500, "SERVICE PLAN"),
      ],
      "2026-04",
    );

    expect(result).toHaveLength(2);
    expect(result.map(({ predictedAmount }) => predictedAmount)).toEqual([10_000, 10_500]);
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

  it("considers compatible amounts on every posting day before ranking", () => {
    const juneHistory = [
      transaction("2026-06-11", 10_000, "SERVICE PLAN"),
      ...Array.from({ length: 7 }, (_, index) =>
        transaction("2026-06-13", 10_100 + index * 100, "SERVICE PLAN"),
      ),
      transaction("2026-06-10", 10_800, "SERVICE PLAN"),
    ];

    const result = generateRecurringCandidates(
      [...juneHistory, transaction("2026-07-10", 10_000, "SERVICE PLAN")],
      "2026-08",
    );

    expect(result[0]).toMatchObject({ predictedDate: "2026-08-10", predictedAmount: 10_400 });
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

  it("preserves malformed full dates with mixed separators as stable identifiers", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-10", 40_000, "SERVICE 2026-02/03"),
        transaction("2026-07-10", 40_000, "SERVICE 2026/02-04"),
      ],
      "2026-08",
    );

    expect(result).toEqual([]);
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

  it("bounds grouping work when description similarity is disabled", () => {
    const history = Array.from({ length: 2_000 }, (_, index) => {
      const identity = Array.from({ length: 4 }, (__, position) =>
        String.fromCharCode(97 + (Math.floor(index / 26 ** position) % 26)),
      ).join("");
      return transaction("2026-07-10", 10_000 + index, `${identity} merchant`);
    });

    expect(
      generateRecurringCandidates(history, "2026-08", {
        descriptionSimilarityThreshold: 0,
      }),
    ).toEqual([]);
  });

  it("ranks description-free amount candidates by each group's current median", () => {
    const competingGroups = Array.from({ length: 8 }, (_, index) =>
      transaction("2026-06-10", 92 + index, `competing ${String.fromCharCode(97 + index)}`),
    );
    const result = generateRecurringCandidates(
      [
        transaction("2026-05-10", 120, "aaa target service"),
        transaction("2026-06-10", 80, "aaa target service"),
        ...competingGroups,
        transaction("2026-07-10", 100, "zzz renamed service"),
      ],
      "2026-08",
      { amountToleranceRatio: 0.5, descriptionSimilarityThreshold: 0 },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      confidence: "high",
      description: "zzz renamed service",
      evidence: { occurrenceCount: 3 },
    });
  });

  it("jointly assigns same-month rows across compatible recurring schedules", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-05", 20_000, "SERVICE PLAN"),
        transaction("2026-06-06", 20_000, "SERVICE PLAN"),
        transaction("2026-07-06", 20_000, "SERVICE PLAN"),
        transaction("2026-07-09", 20_000, "SERVICE PLAN"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(2);
  });

  it("follows an augmenting path across three compatible recurring schedules", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-05", 20_000, "SERVICE PLAN"),
        transaction("2026-06-07", 20_000, "SERVICE PLAN"),
        transaction("2026-06-09", 20_000, "SERVICE PLAN"),
        transaction("2026-07-07", 20_000, "SERVICE PLAN"),
        transaction("2026-07-09", 20_000, "SERVICE PLAN"),
        transaction("2026-07-11", 20_000, "SERVICE PLAN"),
      ],
      "2026-08",
      { dateDriftDays: 2 },
    );

    expect(result).toHaveLength(3);
  });

  it("reassigns same-day rows across amount-compatible schedules", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-10", 90, "MERCHANT PLAN AAA"),
        transaction("2026-06-10", 110, "MERCHANT PLAN CCC"),
        transaction("2026-07-10", 100, "MERCHANT PLAN BBB"),
        transaction("2026-07-10", 110, "MERCHANT PLAN CCC"),
      ],
      "2026-08",
    );

    expect(result).toHaveLength(2);
    expect(result.map(({ evidence }) => evidence.occurrenceCount)).toEqual([2, 2]);
  });

  it("ranks qualifying fuzzy groups before applying the candidate limit", () => {
    const prefix = "recurring common prefix";
    const decoyDescriptions = Array.from({ length: 64 }, (_, index) => {
      const first = String.fromCharCode(97 + Math.floor(index / 26));
      const second = String.fromCharCode(97 + (index % 26));
      return `${prefix}${first}${second}`;
    });
    const history = decoyDescriptions.flatMap((description) => [
      transaction("2026-05-10", 100, description),
      transaction("2026-06-10", 100, description),
    ]);
    history.push(
      transaction("2026-05-10", 99, `${prefix}z`),
      transaction("2026-06-10", 101, `${prefix}z`),
      transaction("2026-07-10", 100, prefix),
    );

    const highCandidate = generateRecurringCandidates(history, "2026-08").find(
      ({ confidence }) => confidence === "high",
    );

    expect(highCandidate).toMatchObject({
      evidence: { amountRange: { min: 99, max: 101 }, occurrenceCount: 3 },
    });
  });

  it("ranks equal-similarity fuzzy groups before applying the candidate limit", () => {
    const prefix = "recurring service";
    const decoyDescriptions = Array.from(
      { length: 65 },
      (_, index) => `${prefix}${String.fromCodePoint(0x4e00 + index)}`,
    );
    const bestDescription = `${prefix}${String.fromCodePoint(0x5000)}`;
    const history = decoyDescriptions.flatMap((description) => [
      transaction("2026-05-10", 100, description),
      transaction("2026-06-10", 100, description),
    ]);
    history.push(
      transaction("2026-04-10", 100, bestDescription),
      transaction("2026-05-10", 100, bestDescription),
      transaction("2026-06-10", 100, bestDescription),
      transaction("2026-07-10", 100, prefix),
    );

    const highCandidate = generateRecurringCandidates(history, "2026-08").find(
      ({ confidence }) => confidence === "high",
    );

    expect(highCandidate).toMatchObject({
      predictedDate: "2026-08-10",
      evidence: { dateRange: { from: "2026-04-10" }, occurrenceCount: 4 },
    });
  });

  it("ranks fuzzy groups by their complete match score before applying the limit", () => {
    const prefix = "recurring service";
    const decoyDescriptions = Array.from(
      { length: 65 },
      (_, index) => `${prefix}${String.fromCodePoint(0x4e00 + index)}`,
    );
    const bestDescription = `${prefix}xyz`;
    const history = decoyDescriptions.flatMap((description) => [
      transaction("2026-05-10", 100, description),
      transaction("2026-06-13", 100, description),
      transaction("2026-07-13", 100, description),
    ]);
    history.push(
      transaction("2026-05-10", 100, bestDescription),
      transaction("2026-06-10", 100, bestDescription),
      transaction("2026-07-13", 100, bestDescription),
      transaction("2026-08-10", 100, prefix),
    );

    const highCandidate = generateRecurringCandidates(history, "2026-09").find(
      ({ confidence }) => confidence === "high",
    );

    expect(highCandidate).toMatchObject({
      predictedDate: "2026-09-10",
      evidence: { occurrenceCount: 4 },
    });
  });

  it("bounds equal-amount buckets with many distinct descriptions", () => {
    const history = Array.from({ length: 5_000 }, (_, index) => {
      const identity = Array.from({ length: 4 }, (__, position) =>
        String.fromCharCode(97 + (Math.floor(index / 26 ** position) % 26)),
      ).join("");
      return transaction("2026-07-10", 20_000, `${identity} merchant`);
    });

    expect(generateRecurringCandidates(history, "2026-08")).toEqual([]);
  });

  it("updates amount indexes as an accepted group's amount drifts", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-05-10", 10_000, "Utilities"),
        transaction("2026-06-10", 11_000, "Utilities"),
        transaction("2026-07-10", 11_500, "Utilities"),
      ],
      "2026-08",
      { descriptionSimilarityThreshold: 0 },
    );

    expect(result[0]).toMatchObject({ confidence: "high", evidence: { occurrenceCount: 3 } });
  });

  it("searches both amount-index sides using the compatibility ratio", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-10", 89, "Utilities"),
        transaction("2026-06-10", 111, "Utilities"),
        transaction("2026-07-10", 100, "Utilities"),
      ],
      "2026-08",
      { descriptionSimilarityThreshold: 0 },
    );

    expect(result[0]).toMatchObject({ confidence: "medium", evidence: { occurrenceCount: 2 } });
  });

  it("bounds amount-index work by candidate groups instead of historical keys", () => {
    const history = Array.from({ length: 8 }, (_, index) =>
      transaction(`2026-${String(index + 1).padStart(2, "0")}-10`, 100 + index, "Utilities"),
    );
    history.push(
      transaction("2026-09-10", 116, "Utilities"),
      transaction("2026-10-10", 106, "Utilities"),
    );

    expect(generateRecurringCandidates(history, "2026-11")[0]).toMatchObject({
      confidence: "medium",
      evidence: { occurrenceCount: 2 },
    });
  });

  it("ranks an exact recurring slot with other compatible schedules", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-05-09", 111, "Utilities"),
        transaction("2026-05-14", 103, "Utilities"),
        transaction("2026-06-12", 89, "Utilities"),
        transaction("2026-06-12", 99, "Utilities"),
        transaction("2026-07-12", 99, "Utilities"),
      ],
      "2026-08",
      { amountToleranceRatio: 0.2 },
    );

    expect(result.find(({ confidence }) => confidence === "high")).toMatchObject({
      predictedAmount: 99,
      evidence: { amountRange: { min: 89, max: 103 } },
    });
  });

  it("ranks exact-label schedules before applying the candidate limit", () => {
    const result = generateRecurringCandidates(
      [
        ...[80, 91, 92, 93, 94, 95, 96, 97, 98].map((amount) =>
          transaction("2026-05-10", amount, "Utilities"),
        ),
        ...[91, 92, 93, 94, 95, 96, 97, 98, 120].map((amount) =>
          transaction("2026-06-10", amount, "Utilities"),
        ),
        transaction("2026-07-10", 100, "Utilities"),
      ],
      "2026-08",
      { amountToleranceRatio: 0.5 },
    );

    expect(result.find(({ confidence }) => confidence === "high")).toMatchObject({
      predictedAmount: 100,
      evidence: { amountRange: { min: 80, max: 120 } },
    });
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

  it("bounds fuzzy scans for many drifted common-prefix descriptions", () => {
    const identity = (index: number) =>
      Array.from({ length: 3 }, (__, position) =>
        String.fromCharCode(97 + (Math.floor(index / 26 ** position) % 26)),
      ).join("");
    const history = ["2026-06-10", "2026-07-11"].flatMap((date, monthIndex) =>
      Array.from({ length: 1_000 }, (_, index) =>
        transaction(
          date,
          20_000,
          `${monthIndex === 0 ? "" : "X"}COMMON UTILITY SERVICE ${identity(index)}`,
        ),
      ),
    );

    expect(generateRecurringCandidates(history, "2026-08")).toHaveLength(1_000);
  });

  it("handles many same-month common labels with distinct amounts", () => {
    const history: RecurringTransaction[] = Array.from({ length: 2_000 }, (_, index) => ({
      ...transaction("2026-07-10", 10_000 + index, "Payment"),
      category: "Utilities",
    }));

    expect(generateRecurringCandidates(history, "2026-08")).toEqual([]);
  });

  it("handles many same-month boundary labels with distinct amounts", () => {
    const history: RecurringTransaction[] = Array.from({ length: 2_000 }, (_, index) => ({
      ...transaction("2026-07-31", 10_000 + index, "Payment"),
      category: "Utilities",
    }));

    expect(generateRecurringCandidates(history, "2026-08")).toEqual([]);
  });

  it("coalesces many exact duplicate labeled occurrences before scoring", () => {
    const july = transaction("2026-07-10", 20_000, "Utilities");
    const history = [transaction("2026-06-10", 20_000, "Utilities"), ...Array(5_000).fill(july)];

    expect(generateRecurringCandidates(history, "2026-08")[0]).toMatchObject({
      confidence: "medium",
      evidence: { occurrenceCount: 2 },
    });
  });

  it("handles many prior-month common-label recurring slots", () => {
    const history: RecurringTransaction[] = ["2026-06-10", "2026-07-10"].flatMap((date) =>
      Array.from({ length: 2_000 }, (_, index) => ({
        ...transaction(date, 10_000 + index, "Payment"),
        category: "Utilities",
      })),
    );

    expect(generateRecurringCandidates(history, "2026-08")).toHaveLength(2_000);
  });

  it("handles many common-label slots with accepted date drift", () => {
    const history: RecurringTransaction[] = ["2026-06-10", "2026-07-11"].flatMap((date) =>
      Array.from({ length: 2_000 }, (_, index) => ({
        ...transaction(date, 10_000 + index, "Payment"),
        category: "Utilities",
      })),
    );

    expect(generateRecurringCandidates(history, "2026-08")).toHaveLength(2_000);
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

  it("returns an unlabelled recent large income as a low-confidence candidate", () => {
    const history: RecurringTransaction[] = [
      {
        accountId: accountA,
        date: "2026-07-10",
        amount: 150_000,
        type: "income",
      },
    ];

    expect(generateRecurringCandidates(history, "2026-08")[0]).toMatchObject({
      confidence: "low",
      description: null,
    });
  });

  it("deduplicates identical isolated large incomes", () => {
    const income: RecurringTransaction = {
      accountId: accountA,
      date: "2026-07-10",
      amount: 150_000,
      type: "income",
    };

    expect(generateRecurringCandidates([income, { ...income }], "2026-08")).toHaveLength(1);
  });

  it("canonicalizes null and empty descriptions independently of input order", () => {
    const nullDescription: RecurringTransaction = {
      accountId: accountA,
      date: "2026-07-10",
      amount: 150_000,
      description: null,
      type: "income",
    };
    const emptyDescription = { ...nullDescription, description: "" };
    const candidate = (history: RecurringTransaction[]) =>
      generateRecurringCandidates(history, "2026-08")[0];

    expect(candidate([nullDescription, emptyDescription])).toEqual(
      candidate([emptyDescription, nullDescription]),
    );
    expect(candidate([nullDescription, emptyDescription]).description).toBeNull();
  });

  it("preserves isolated large incomes with distinct original descriptions", () => {
    const history = [
      transaction("2026-07-10", 150_000, "Payment", "income"),
      transaction("2026-07-10", 150_000, "振込", "income"),
    ];

    expect(generateRecurringCandidates(history, "2026-08")).toHaveLength(2);
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

  it("infers an active boundary suffix before occurrence-month deduplication", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-01-27", 80_000, "定期支払"),
        transaction("2026-02-28", 80_000, "定期支払"),
        transaction("2026-03-31", 80_000, "定期支払"),
        transaction("2026-05-02", 80_000, "定期支払"),
        transaction("2026-05-31", 80_000, "定期支払"),
        transaction("2026-06-30", 80_000, "定期支払"),
      ],
      "2026-07",
    );

    expect(result[0]).toMatchObject({
      confidence: "high",
      predictedDate: "2026-07-31",
      evidence: { occurrenceCount: 5 },
    });
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

  it("orders locale-sensitive descriptions by Unicode code point", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-10", 20_000, "ä"),
        transaction("2026-07-10", 20_000, "ä"),
        transaction("2026-06-10", 20_000, "z"),
        transaction("2026-07-10", 20_000, "z"),
      ],
      "2026-08",
    );

    expect(result.map(({ description }) => description)).toEqual(["z", "ä"]);
  });

  it("returns an empty list for empty input", () => {
    expect(generateRecurringCandidates([], "2026-08")).toEqual([]);
  });

  it("computes an even-sized median without overflowing finite amounts", () => {
    const result = generateRecurringCandidates(
      [
        transaction("2026-06-10", Number.MAX_VALUE, "定期支払"),
        transaction("2026-07-10", Number.MAX_VALUE, "定期支払"),
      ],
      "2026-08",
    );

    expect(result[0]?.predictedAmount).toBe(Number.MAX_VALUE);
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
