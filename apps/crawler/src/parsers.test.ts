import { describe, test, expect } from "vitest";
import {
  parseJapaneseNumber,
  parseDecimalNumber,
  parsePercentage,
  convertDateToIso,
  calculateChange,
} from "./parsers.js";

describe("parseJapaneseNumber", () => {
  test("億と万を含む文字列をパースする", () => {
    expect(parseJapaneseNumber("1億9233万")).toBe(192330000);
  });

  test("万を含む文字列をパースする", () => {
    expect(parseJapaneseNumber("5万")).toBe(50000);
  });

  test("億のみを含む文字列をパースする", () => {
    expect(parseJapaneseNumber("2億")).toBe(200000000);
  });

  test("カンマ区切りの数値をパースする", () => {
    expect(parseJapaneseNumber("1,234,567")).toBe(1234567);
  });

  test("円記号を除去する", () => {
    expect(parseJapaneseNumber("¥1,234円")).toBe(1234);
  });

  test("空文字列は0を返す", () => {
    expect(parseJapaneseNumber("")).toBe(0);
  });

  test("数値のない文字列は0を返す", () => {
    expect(parseJapaneseNumber("abc")).toBe(0);
  });

  // Edge cases - critical for data integrity
  test("ハイフン表記は0を返す", () => {
    expect(parseJapaneseNumber("-")).toBe(0);
  });

  test("負数をパースする", () => {
    expect(parseJapaneseNumber("-1,234")).toBe(-1234);
  });

  test("スペースを含む数値をパースする", () => {
    expect(parseJapaneseNumber(" 1,234 ")).toBe(1234);
  });

  test("億万の後に残りの数値がある場合", () => {
    expect(parseJapaneseNumber("1億2345万6789")).toBe(123456789);
  });

  test("億万表記の負数をパースする", () => {
    expect(parseJapaneseNumber("-1万")).toBe(-10000);
    expect(parseJapaneseNumber("−1万")).toBe(-10000);
    expect(parseJapaneseNumber("▲2億")).toBe(-200000000);
  });

  test("小数の億万表記をパースする", () => {
    expect(parseJapaneseNumber("1.5万")).toBe(15000);
    expect(parseJapaneseNumber("1.2億")).toBe(120000000);
  });

  test("全角マイナスをパースする", () => {
    expect(parseJapaneseNumber("−1,234")).toBe(-1234);
  });

  test("▲記号を負数としてパースする", () => {
    expect(parseJapaneseNumber("▲1,234")).toBe(-1234);
  });

  test("プラス記号を含む数値をパースする", () => {
    expect(parseJapaneseNumber("+1,234")).toBe(1234);
  });

  test("ドル記号を除去する", () => {
    expect(parseJapaneseNumber("$1,234")).toBe(1234);
  });
});

describe("parseDecimalNumber", () => {
  test("整数をパースする", () => {
    expect(parseDecimalNumber("1,234")).toBe(1234);
  });

  test("小数をパースする", () => {
    expect(parseDecimalNumber("1,234.56")).toBe(1234.56);
  });

  test("負の小数をパースする", () => {
    expect(parseDecimalNumber("-1,234.56")).toBe(-1234.56);
  });

  test("全角マイナスの小数をパースする", () => {
    expect(parseDecimalNumber("−1,234.56")).toBe(-1234.56);
  });

  test("▲記号の小数をパースする", () => {
    expect(parseDecimalNumber("▲1,234.56")).toBe(-1234.56);
  });

  test("ドル記号を除去して小数をパースする", () => {
    expect(parseDecimalNumber("$60.75")).toBe(60.75);
  });

  test("円記号を除去して小数をパースする", () => {
    expect(parseDecimalNumber("¥1,234.5円")).toBe(1234.5);
  });

  test("空文字列は0を返す", () => {
    expect(parseDecimalNumber("")).toBe(0);
  });

  test("無効な文字列は0を返す", () => {
    expect(parseDecimalNumber("abc")).toBe(0);
  });
});

describe("parsePercentage", () => {
  test("パーセント記号を除去してパースする", () => {
    expect(parsePercentage("+2.2%")).toBe(2.2);
  });

  test("マイナスのパーセントをパースする", () => {
    expect(parsePercentage("-0.5%")).toBe(-0.5);
  });

  test("全角パーセントをパースする", () => {
    expect(parsePercentage("1.5％")).toBe(1.5);
  });

  test("全角マイナスと▲表記のパーセントをパースする", () => {
    expect(parsePercentage("−2.2％")).toBe(-2.2);
    expect(parsePercentage("▲2.2%")).toBe(-2.2);
  });

  test("空文字列は undefined を返す", () => {
    expect(parsePercentage("")).toBeUndefined();
  });

  test("無効な文字列は undefined を返す", () => {
    expect(parsePercentage("abc")).toBeUndefined();
  });
});

describe("convertDateToIso", () => {
  test("MM/DD(曜日) を ISO 形式に変換する", () => {
    expect(convertDateToIso("04/22(火)", 2025)).toBe("2025-04-22");
  });

  test("MM/DD を ISO 形式に変換する", () => {
    expect(convertDateToIso("4/5", 2025)).toBe("2025-04-05");
  });

  test("既に ISO 形式の場合そのまま返す", () => {
    expect(convertDateToIso("2025-04-22", 2025)).toBe("2025-04-22");
  });

  test("空文字列は空文字列を返す", () => {
    expect(convertDateToIso("", 2025)).toBe("");
  });
});

describe("calculateChange", () => {
  test("正の差額を計算する", () => {
    expect(calculateChange("2,000", "1,000")).toBe("+¥1,000");
  });

  test("負の差額を計算する", () => {
    expect(calculateChange("1,000", "2,000")).toBe("¥-1,000");
  });

  test("差額が0の場合", () => {
    expect(calculateChange("1,000", "1,000")).toBe("+¥0");
  });

  test("パース不能な値は0として扱われる", () => {
    // parseJapaneseNumber("abc") returns 0, so isNaN check passes
    // diff = 0 - 1000 = -1000
    expect(calculateChange("abc", "1,000")).toBe("¥-1,000");
  });
});
