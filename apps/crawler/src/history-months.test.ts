import { describe, expect, test } from "vitest";
import {
  getHistoryMaxMonths,
  getHistoryMaxMonthsFromAnchor,
  getHistoryMonth,
  getHistoryMonthFromAnchor,
} from "./history-months.js";

describe("getHistoryMonth", () => {
  test("月末でも前月にロールオーバーしない", () => {
    const now = new Date("2026-03-31T12:00:00+09:00");

    expect(getHistoryMonth(now, 0)).toBe("2026-03");
    expect(getHistoryMonth(now, 1)).toBe("2026-02");
    expect(getHistoryMonth(now, 2)).toBe("2026-01");
  });

  test("年をまたいだ履歴月を計算する", () => {
    const now = new Date("2026-01-31T12:00:00+09:00");

    expect(getHistoryMonth(now, 1)).toBe("2025-12");
    expect(getHistoryMonth(now, 2)).toBe("2025-11");
  });

  test("UTC環境でもJST基準の年月を使う", () => {
    const now = new Date("2026-06-30T21:50:00Z");

    expect(getHistoryMonth(now, 0)).toBe("2026-07");
    expect(getHistoryMonth(now, 1)).toBe("2026-06");
  });

  test("履歴取得月数もJST基準の当月から計算する", () => {
    const now = new Date("2026-01-31T16:00:00Z"); // 2026-02-01 01:00 JST

    expect(getHistoryMaxMonths(now)).toBe(14);
  });

  test("締め日後の会計期間月から前年1月までを計算する", () => {
    expect(getHistoryMaxMonthsFromAnchor("2026-09")).toBe(21);
    expect(getHistoryMonthFromAnchor("2026-09", 20)).toBe("2025-01");
  });

  test("指定した開始月を含む履歴月数を計算する", () => {
    expect(getHistoryMaxMonthsFromAnchor("2026-09", "2020-04")).toBe(78);
    expect(getHistoryMonthFromAnchor("2026-09", 77)).toBe("2020-04");
  });

  test("開始月と現在月が同じ場合は1か月を取得する", () => {
    expect(getHistoryMaxMonthsFromAnchor("2026-09", "2026-09")).toBe(1);
  });

  test("開始月が現在月より後の場合は拒否する", () => {
    expect(() => getHistoryMaxMonthsFromAnchor("2026-09", "2026-10")).toThrow(
      "HISTORY_START_MONTH (2026-10) must not be after the active accounting month (2026-09)",
    );
  });

  test("開始月がYYYY-MM形式でない場合は拒否する", () => {
    expect(() => getHistoryMaxMonthsFromAnchor("2026-09", "2020-4")).toThrow(
      "Invalid year-month key: 2020-4",
    );
  });
});
