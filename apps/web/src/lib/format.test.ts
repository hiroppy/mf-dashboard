import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatDate,
  formatMonth,
  getShortMonth,
  formatDateShort,
  formatDateTime,
  formatTime,
  formatElapsedTime,
  formatLastUpdated,
} from "./format";

describe("formatCurrency", () => {
  it("正の値をフォーマットする", () => {
    expect(formatCurrency(1234567)).toBe("1,234,567円");
  });

  it("0をフォーマットする", () => {
    expect(formatCurrency(0)).toBe("0円");
  });

  it("負の値をフォーマットする", () => {
    expect(formatCurrency(-500)).toBe("-500円");
  });

  it("showPlusSIgn=true で正の値にプラス記号を付ける", () => {
    expect(formatCurrency(1000, true)).toBe("+1,000円");
  });

  it("showPlusSign=true でも0にはプラス記号を付けない", () => {
    expect(formatCurrency(0, true)).toBe("0円");
  });

  it("showPlusSign=true でも負の値にはプラス記号を付けない", () => {
    expect(formatCurrency(-500, true)).toBe("-500円");
  });
});

describe("formatNumber", () => {
  it("カンマ区切りでフォーマットする", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
});

describe("formatPercent", () => {
  it("正の値をフォーマットする", () => {
    expect(formatPercent(12.345)).toBe("12.3%");
  });

  it("負の値にマイナス記号を付けてフォーマットする", () => {
    expect(formatPercent(-5.678)).toBe("-5.7%");
  });

  it("小数桁数を指定できる", () => {
    expect(formatPercent(12.345, 2)).toBe("12.35%");
  });
});

describe("formatMonth", () => {
  it("YYYY-MM を年月表示に変換する", () => {
    expect(formatMonth("2025-04")).toBe("2025年4月");
  });

  it("0埋め月を正しく変換する", () => {
    expect(formatMonth("2025-05")).toBe("2025年5月");
  });
});

describe("getShortMonth", () => {
  it("短い月表示を返す", () => {
    expect(getShortMonth("2025-04")).toBe("4月");
  });
});

describe("formatDate", () => {
  it("日付を年月日形式でフォーマットする", () => {
    const result = formatDate("2025-04-15");
    expect(result).toBe("2025年4月15日");
  });

  it("日付キーをDate timezone parsingに通さず表示する", () => {
    expect(formatDate("2025-04-01")).toBe("2025年4月1日");
  });
});

describe("formatDateShort", () => {
  it("日付を月日形式でフォーマットする（年なし）", () => {
    const result = formatDateShort("2025-04-15");
    expect(result).toBe("4月15日");
  });
});

describe("formatDateTime", () => {
  it("日付と時刻をフォーマットする", () => {
    // UTCで01:30 → JSTで10:30
    const result = formatDateTime("2025-04-30T01:30:00Z");
    expect(result).toMatch(/4/);
    expect(result).toMatch(/30/);
    expect(result).toMatch(/10/);
    expect(result).toMatch(/30/);
  });
});

describe("formatTime", () => {
  it("時刻だけをJSTでフォーマットする", () => {
    expect(formatTime("2025-04-30T09:56:00Z")).toBe("18:56");
  });
});

describe("formatElapsedTime", () => {
  const startedAt = "2026-07-23T09:00:00.000Z";

  it.each([
    ["2026-07-23T09:00:05.000Z", "00:05"],
    ["2026-07-23T09:00:59.000Z", "00:59"],
    ["2026-07-23T09:01:00.000Z", "01:00"],
    ["2026-07-23T10:01:05.000Z", "61:05"],
  ])("終了時刻 %s までの経過時間を %s と表示する", (finishedAt, expected) => {
    expect(formatElapsedTime(startedAt, finishedAt)).toBe(expected);
  });

  it("実行中は現在時刻までの経過時間を表示する", () => {
    expect(formatElapsedTime(startedAt, null, Date.parse("2026-07-23T09:00:05.000Z"))).toBe(
      "00:05",
    );
  });

  it("不正な時刻は表示しない", () => {
    expect(formatElapsedTime("invalid", null)).toBeNull();
  });
});

describe("formatLastUpdated", () => {
  it("nullを渡すとnullを返す", () => {
    expect(formatLastUpdated(null)).toBeNull();
  });

  it("無効な日付文字列でnullを返す", () => {
    expect(formatLastUpdated("invalid-date")).toBeNull();
  });

  it("年なしでフォーマットする（デフォルト）", () => {
    // ローカルタイムで作成
    const result = formatLastUpdated("2025-04-15T10:30:00");
    expect(result).toBe("4/15 10:30");
  });

  it("年ありでフォーマットする", () => {
    const result = formatLastUpdated("2025-04-15T10:30:00", true);
    expect(result).toBe("2025/4/15 10:30");
  });

  it("時刻を0埋めする", () => {
    const result = formatLastUpdated("2025-01-05T09:05:00");
    expect(result).toBe("1/5 09:05");
  });
});
