import { describe, test, expect } from "vitest";
import {
  identifyTableTypeFromTitle,
  isPointCategory,
  parseDepositPortfolioItem,
  parseFundPortfolioItem,
  parseOptionalJapaneseNumber,
  parsePnsPortfolioItem,
  parseStockPortfolioItem,
  resolveDepositTableCategory,
} from "./portfolio.js";

describe("identifyTableTypeFromTitle", () => {
  test("「ポイント・マイル」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("ポイント・マイル")).toBe("ポイント・マイル");
  });

  test("「年金」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("年金")).toBe("年金");
  });

  test("「保険」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("保険")).toBe("保険");
  });

  test("「預金・現金・暗号資産」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("預金・現金・暗号資産")).toBe("預金・現金・暗号資産");
  });

  test("現在の分離済み流動資産カテゴリはそのまま返す", () => {
    expect(identifyTableTypeFromTitle("預金・現金")).toBe("預金・現金");
    expect(identifyTableTypeFromTitle("暗号資産")).toBe("暗号資産");
    expect(identifyTableTypeFromTitle("電子マネー・プリペイド")).toBe("電子マネー・プリペイド");
    expect(identifyTableTypeFromTitle("ポイント")).toBe("ポイント");
  });

  test("「株式(現物)」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("株式(現物)")).toBe("株式(現物)");
  });

  test("「投資信託」はそのまま返す", () => {
    expect(identifyTableTypeFromTitle("投資信託")).toBe("投資信託");
  });

  test("不明なタイトルは「不明」を返す", () => {
    expect(identifyTableTypeFromTitle("")).toBe("不明");
    expect(identifyTableTypeFromTitle("不明なカテゴリ")).toBe("不明");
  });
});

describe("resolveDepositTableCategory", () => {
  test("現在の分離済み流動資産カテゴリを返す", () => {
    expect(resolveDepositTableCategory("預金・現金")).toBe("預金・現金");
    expect(resolveDepositTableCategory("暗号資産")).toBe("暗号資産");
    expect(resolveDepositTableCategory("電子マネー・プリペイド")).toBe("電子マネー・プリペイド");
  });

  test("legacyカテゴリと未知のタイトルはlegacy預金カテゴリとして扱う", () => {
    expect(resolveDepositTableCategory("預金・現金・暗号資産")).toBe("預金・現金・暗号資産");
    expect(resolveDepositTableCategory("")).toBe("預金・現金・暗号資産");
    expect(resolveDepositTableCategory("その他")).toBe("預金・現金・暗号資産");
  });
});

describe("parseDepositPortfolioItem", () => {
  test("section title由来のsplitカテゴリを保持する", () => {
    const item = parseDepositPortfolioItem("暗号資産", "Crypto Asset A", "Institution A", "1,234");

    expect(item).toEqual({
      name: "Crypto Asset A",
      type: "暗号資産",
      institution: "Institution A",
      balance: 1234,
    });
  });

  test("名前が空の行は無視する", () => {
    expect(parseDepositPortfolioItem("預金・現金", " ", "Institution A", "1,234")).toBeNull();
  });
});

describe("isPointCategory", () => {
  test("現在とlegacyのポイントカテゴリを判定する", () => {
    expect(isPointCategory("ポイント")).toBe(true);
    expect(isPointCategory("ポイント・マイル")).toBe(true);
    expect(isPointCategory("年金")).toBe(false);
  });
});

describe("parsePnsPortfolioItem", () => {
  test("現在の「ポイント」カテゴリはポイント用カラムでパースする", () => {
    const item = parsePnsPortfolioItem("ポイント", [
      "Point Service A",
      "not used",
      "999",
      "not used",
      "1,234",
      "not used",
      "Institution A",
    ]);

    expect(item).toEqual({
      name: "Point Service A",
      type: "ポイント",
      institution: "Institution A",
      balance: 1234,
    });
  });

  test("legacyの「ポイント・マイル」カテゴリもポイント用カラムでパースする", () => {
    const item = parsePnsPortfolioItem("ポイント・マイル", [
      "Point Service B",
      "not used",
      "999",
      "not used",
      "2,345",
      "not used",
      "Institution B",
    ]);

    expect(item).toEqual({
      name: "Point Service B",
      type: "ポイント・マイル",
      institution: "Institution B",
      balance: 2345,
    });
  });

  test("保険カテゴリは保険・年金用カラムでパースする", () => {
    const item = parsePnsPortfolioItem("保険", [
      "Insurance A",
      "1,000",
      "3,000",
      "200",
      "10%",
      "not used",
      "not used",
    ]);

    expect(item).toEqual({
      name: "Insurance A",
      type: "保険",
      institution: "",
      balance: 3000,
      avgCostPrice: 1000,
      unrealizedGain: 200,
      unrealizedGainPct: 10,
    });
  });
});

describe("parseOptionalJapaneseNumber", () => {
  test("0 は有効な数値として保持する", () => {
    expect(parseOptionalJapaneseNumber("0")).toBe(0);
    expect(parseOptionalJapaneseNumber("¥0")).toBe(0);
  });

  test("空文字は undefined を返す", () => {
    expect(parseOptionalJapaneseNumber("")).toBeUndefined();
    expect(parseOptionalJapaneseNumber("   ")).toBeUndefined();
  });

  test("プレースホルダーは undefined を返す", () => {
    expect(parseOptionalJapaneseNumber("-")).toBeUndefined();
    expect(parseOptionalJapaneseNumber("−")).toBeUndefined();
    expect(parseOptionalJapaneseNumber("—")).toBeUndefined();
  });
});

describe("parseStockPortfolioItem", () => {
  test("株式の全詳細カラムをPortfolioItemへ変換する", () => {
    expect(
      parseStockPortfolioItem({
        name: "Stock A",
        code: "1234",
        institution: "Institution A",
        balance: "1,234,500円",
        quantity: "100",
        avgCost: "10,000",
        unitPrice: "12,345",
        dailyChange: "+120円",
        unrealizedGain: "+234,500円",
        unrealizedGainPct: "+23.45%",
      }),
    ).toEqual({
      name: "Stock A",
      code: "1234",
      type: "株式(現物)",
      institution: "Institution A",
      balance: 1234500,
      quantity: 100,
      avgCostPrice: 10000,
      unitPrice: 12345,
      dailyChange: 120,
      unrealizedGain: 234500,
      unrealizedGainPct: 23.45,
    });
  });
});

describe("parseFundPortfolioItem", () => {
  test("投資信託の0と欠損値を区別して変換する", () => {
    expect(
      parseFundPortfolioItem({
        name: "Fund A",
        institution: "Institution A",
        balance: "500,000円",
        quantity: "52.3491",
        avgCost: "9,551",
        unitPrice: "10,000",
        dailyChange: "0",
        unrealizedGain: "-",
        unrealizedGainPct: "-",
      }),
    ).toEqual({
      name: "Fund A",
      type: "投資信託",
      institution: "Institution A",
      balance: 500000,
      quantity: 52.3491,
      avgCostPrice: 9551,
      unitPrice: 10000,
      dailyChange: 0,
      unrealizedGain: undefined,
      unrealizedGainPct: undefined,
    });
  });
});
