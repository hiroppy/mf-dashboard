import { describe, expect, test } from "vitest";
import { parseMonthlySummaryMonths } from "./monthly-summary.js";

describe("parseMonthlySummaryMonths", () => {
  test("ゼロ埋め済みの日付ヘッダーを YYYY-MM に正規化する", () => {
    expect(parseMonthlySummaryMonths(["", "2024/09/01〜"])).toEqual(["2024-09"]);
  });

  test("ゼロ埋めなしの日付ヘッダーを YYYY-MM に正規化する", () => {
    expect(parseMonthlySummaryMonths(["", "2024/9/1〜", "2024/10/01〜"])).toEqual([
      "2024-09",
      "2024-10",
    ]);
  });

  test("無効なヘッダーは無視する", () => {
    expect(parseMonthlySummaryMonths(["", "2024-09-01", "2024/9/1", "支出合計"])).toEqual([]);
  });
});
