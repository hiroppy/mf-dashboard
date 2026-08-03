import type { Locator, Page } from "playwright";
import { describe, expect, test, vi } from "vitest";
import {
  buildMonthRange,
  extractCashFlowFromPage,
  isSupportedCashFlowAmount,
  parseDetailRow,
  resolveCashFlowDate,
  resolveCashFlowPeriod,
  scrapeCashFlowHistory,
  verifyCashFlowRowsComplete,
} from "./cash-flow-history.js";

describe("buildMonthRange", () => {
  test.each([
    ["2023-01", { from: "2023/01/01", to: "2023/01/31" }],
    ["2023-02", { from: "2023/02/01", to: "2023/02/28" }],
    ["2024-02", { from: "2024/02/01", to: "2024/02/29" }],
    ["2023-04", { from: "2023/04/01", to: "2023/04/30" }],
    ["2023-12", { from: "2023/12/01", to: "2023/12/31" }],
  ])("%s の月初/月末範囲を返す", (month, expected) => {
    expect(buildMonthRange(month)).toEqual(expected);
  });
});

describe("resolveCashFlowPeriod", () => {
  test("月跨ぎの表示範囲を保持する", () => {
    expect(resolveCashFlowPeriod("2026/7/26 - 2026/8/25", "2026-08")).toEqual({
      periodStart: "2026-07-26",
      periodEnd: "2026-08-25",
    });
  });

  test("表示範囲がなければ対象月の月初月末を使う", () => {
    expect(resolveCashFlowPeriod("2026年8月", "2026-08")).toEqual({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
  });
});

describe("resolveCashFlowDate", () => {
  const period = { periodStart: "2026-12-26", periodEnd: "2027-01-25" };

  test.each([
    ["12/31", "2026-12-31"],
    ["01/01", "2027-01-01"],
  ])("年跨ぎ期間の %s を %s として解釈する", (dateText, expected) => {
    expect(resolveCashFlowDate(dateText, 2027, period)).toBe(expected);
  });
});

describe("isSupportedCashFlowAmount", () => {
  test.each(["0", "1,000", "-1,000", "¥1,000円", "▲ 1,000", "-1,000\n(振替)"])(
    "%j を対応する金額形式として受け入れる",
    (value) => {
      expect(isSupportedCashFlowAmount(value)).toBe(true);
    },
  );

  test.each(["", "--", "取得中", "1,23", "1.5", "取得中(振替)"])(
    "%j を月次置換可能な金額として扱わない",
    (value) => {
      expect(isSupportedCashFlowAmount(value)).toBe(false);
    },
  );
});

describe("verifyCashFlowRowsComplete", () => {
  test("0件でもCSVリンクがなく集計値が0なら明示的な空期間として受け入れる", async () => {
    const page = {
      locator: vi.fn<() => { count: () => Promise<number> }>().mockReturnValue({
        count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
      }),
    } as unknown as Page;

    await expect(verifyCashFlowRowsComplete(page, 0, [0, 0, 0])).resolves.toBeUndefined();
  });

  test.each([
    [1, [0, 0, 0]],
    [0, [1, 0, 1]],
  ])("CSVリンク数 %i と集計値 %j の0件表示を完全とは扱わない", async (csvLinks, totals) => {
    const page = {
      locator: vi.fn<() => { count: () => Promise<number> }>().mockReturnValue({
        count: vi.fn<() => Promise<number>>().mockResolvedValue(csvLinks),
      }),
    } as unknown as Page;

    await expect(verifyCashFlowRowsComplete(page, 0, totals)).rejects.toThrow(
      "explicit empty cash flow period",
    );
  });
});

describe("scrapeCashFlowHistory", () => {
  test("前月 navigation の失敗を対象月の callback に通知する", async () => {
    const detailTable = {
      waitFor: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as Locator;
    let csvLink: Locator;
    csvLink = {
      first: vi.fn<() => Locator>(() => csvLink),
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
      getAttribute: vi
        .fn<(name: string) => Promise<string | null>>()
        .mockResolvedValue("/cf/csv?year=2026&month=7"),
    } as unknown as Locator;
    let monthHeader: Locator;
    monthHeader = {
      first: vi.fn<() => Locator>(() => monthHeader),
      count: vi.fn<() => Promise<number>>().mockResolvedValue(1),
      textContent: vi.fn<() => Promise<string | null>>().mockResolvedValue("2026年7月"),
    } as unknown as Locator;
    const amountCell = {
      textContent: vi.fn<() => Promise<string | null>>().mockResolvedValue("0"),
    } as unknown as Locator;
    const summaryCells = {
      nth: vi.fn<(index: number) => Locator>().mockReturnValue(amountCell),
    } as unknown as Locator;
    const summaryRow = {
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(summaryCells),
    } as unknown as Locator;
    const summaryRows = {
      first: vi.fn<() => Locator>().mockReturnValue(summaryRow),
    } as unknown as Locator;
    const detailRows = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
    } as unknown as Locator;
    let previousButton: Locator;
    previousButton = {
      first: vi.fn<() => Locator>(() => previousButton),
      click: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as Locator;
    const page = {
      goto: vi.fn<() => Promise<null>>().mockResolvedValue(null),
      evaluate: vi.fn<(callback: unknown, argument: string) => Promise<void>>().mockResolvedValue(),
      locator: vi.fn<(selector: string) => Locator>().mockImplementation((selector) => {
        if (selector === "#cf-detail-table") return detailTable;
        if (selector === "a[href*='/cf/csv']") return csvLink;
        if (selector === ".fc-header-title h2") return monthHeader;
        if (selector === "#monthly_total_table_kakeibo tbody tr") return summaryRows;
        if (selector === "#cf-detail-table tbody > tr") return detailRows;
        if (selector === "button.fc-button-prev, span.fc-button-prev") return previousButton;
        return {
          count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
        } as unknown as Locator;
      }),
      waitForResponse: vi
        .fn<() => Promise<never>>()
        .mockRejectedValue(new Error("Navigation Timeout")),
    } as unknown as Page;
    const onMonthFailure = vi.fn<(month: string, error: unknown) => void>();

    await expect(scrapeCashFlowHistory(page, 2, { onMonthFailure })).rejects.toThrow(/Timeout/);
    expect(onMonthFailure).toHaveBeenCalledWith("2026-07", expect.any(Error));
  });

  test("前月レスポンス本文の受信失敗を履歴末尾として扱わない", async () => {
    const self = <T extends object>(value: T): T & { first: () => T } =>
      Object.assign(value, { first: () => value });
    const csvLink = self({
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
      getAttribute: vi
        .fn<() => Promise<string | null>>()
        .mockResolvedValue("/cf/csv?year=2026&month=7"),
    });
    const monthHeader = self({
      count: vi.fn<() => Promise<number>>().mockResolvedValue(1),
      textContent: vi.fn<() => Promise<string | null>>().mockResolvedValue("2026年7月"),
    });
    const amountCell = {
      textContent: vi.fn<() => Promise<string | null>>().mockResolvedValue("0"),
    };
    const summaryRows = self({
      locator: vi
        .fn<(selector: string) => unknown>()
        .mockReturnValue({ nth: vi.fn<(index: number) => unknown>().mockReturnValue(amountCell) }),
    });
    const previousButton = self({
      click: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });
    const page = {
      goto: vi.fn<() => Promise<null>>().mockResolvedValue(null),
      evaluate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      waitForFunction: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      waitForResponse: vi.fn<() => Promise<unknown>>().mockResolvedValue({
        finished: vi
          .fn<() => Promise<Error>>()
          .mockResolvedValue(new Error("response body failed")),
      }),
      locator: vi.fn<(selector: string) => unknown>((selector) => {
        if (selector === "#cf-detail-table") {
          return { waitFor: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) };
        }
        if (selector === "a[href*='/cf/csv']") return csvLink;
        if (selector === ".fc-header-title h2") return monthHeader;
        if (selector === "#monthly_total_table_kakeibo tbody tr") return summaryRows;
        if (selector === "#cf-detail-table tbody > tr") {
          return { count: vi.fn<() => Promise<number>>().mockResolvedValue(0) };
        }
        if (selector === "button.fc-button-prev, span.fc-button-prev") return previousButton;
        return self({ count: vi.fn<() => Promise<number>>().mockResolvedValue(0) });
      }),
    } as unknown as Page;
    const onMonthFailure = vi.fn<(month: string, error: unknown) => void>();

    await expect(scrapeCashFlowHistory(page, 2, { onMonthFailure })).rejects.toThrow(
      "response body failed",
    );
    expect(onMonthFailure).toHaveBeenCalledWith("2026-07", expect.any(Error));
  });

  test("IDのない取引行をselectorで除外せず月次抽出を失敗させる", async () => {
    let monthHeader: Locator;
    monthHeader = {
      first: vi.fn<() => Locator>(() => monthHeader),
      count: vi.fn<() => Promise<number>>().mockResolvedValue(1),
      textContent: vi.fn<() => Promise<string | null>>().mockResolvedValue("2026年7月"),
    } as unknown as Locator;

    const amountCell = {
      textContent: vi.fn<() => Promise<string | null>>().mockResolvedValue("0"),
    } as unknown as Locator;
    const summaryCells = {
      nth: vi.fn<(index: number) => Locator>().mockReturnValue(amountCell),
    } as unknown as Locator;
    const summaryRow = {
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(summaryCells),
    } as unknown as Locator;
    const summaryRows = {
      first: vi.fn<() => Locator>().mockReturnValue(summaryRow),
    } as unknown as Locator;

    const texts = new Map([
      [1, "07/01"],
      [2, "Transaction A"],
      [3, "1,000"],
    ]);
    const cells = {
      nth: vi.fn<(index: number) => Locator>((index) => {
        return {
          textContent: vi
            .fn<() => Promise<string | null>>()
            .mockResolvedValue(texts.get(index) ?? ""),
        } as unknown as Locator;
      }),
    } as unknown as Locator;
    const rowWithoutId = {
      getAttribute: vi.fn<(name: string) => Promise<string | null>>().mockResolvedValue(""),
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(cells),
    } as unknown as Locator;
    const detailRows = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(1),
      nth: vi.fn<(index: number) => Locator>().mockReturnValue(rowWithoutId),
    } as unknown as Locator;
    let missing: Locator;
    missing = {
      first: vi.fn<() => Locator>(() => missing),
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
    } as unknown as Locator;
    const page = {
      locator: vi.fn<(selector: string) => Locator>().mockImplementation((selector) => {
        if (selector === ".fc-header-title h2") return monthHeader;
        if (selector === "#monthly_total_table_kakeibo tbody tr") return summaryRows;
        if (selector === "#cf-detail-table tbody > tr") return detailRows;
        return missing;
      }),
    } as unknown as Page;

    await expect(extractCashFlowFromPage(page)).rejects.toThrow(
      "Incomplete cash flow transaction row",
    );
  });

  test("空の集計セルを完全な月次結果として扱わない", async () => {
    let monthHeader: Locator;
    monthHeader = {
      first: vi.fn<() => Locator>(() => monthHeader),
      count: vi.fn<() => Promise<number>>().mockResolvedValue(1),
      textContent: vi.fn<() => Promise<string | null>>().mockResolvedValue("2026年7月"),
    } as unknown as Locator;
    const emptyCell = {
      textContent: vi.fn<() => Promise<string | null>>().mockResolvedValue(""),
    } as unknown as Locator;
    const summaryCells = {
      nth: vi.fn<() => Locator>().mockReturnValue(emptyCell),
    } as unknown as Locator;
    const summaryRow = {
      locator: vi.fn<() => Locator>().mockReturnValue(summaryCells),
    } as unknown as Locator;
    const summaryRows = {
      first: vi.fn<() => Locator>().mockReturnValue(summaryRow),
    } as unknown as Locator;
    let missing: Locator;
    missing = {
      first: vi.fn<() => Locator>(() => missing),
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
    } as unknown as Locator;
    const page = {
      locator: vi.fn<(selector: string) => Locator>().mockImplementation((selector) => {
        if (selector === ".fc-header-title h2") return monthHeader;
        if (selector === "#monthly_total_table_kakeibo tbody tr") return summaryRows;
        return missing;
      }),
    } as unknown as Page;

    await expect(extractCashFlowFromPage(page)).rejects.toThrow("complete cash flow summary");
  });
});

describe("parseDetailRow", () => {
  test("正常に取得した空の内容欄を保持する", async () => {
    const missingChild = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
    } as unknown as Locator;
    const accountCell = {
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(missingChild),
      textContent: vi.fn<Locator["textContent"]>().mockResolvedValue(""),
    } as unknown as Locator;
    const texts = new Map([
      [1, "07/01"],
      [2, ""],
      [3, "1,000"],
      [5, ""],
      [6, ""],
    ]);
    const cells = {
      nth: vi.fn<(index: number) => Locator>((index) => {
        if (index === 4) return accountCell;
        return {
          textContent: vi.fn<Locator["textContent"]>().mockResolvedValue(texts.get(index) ?? ""),
        } as unknown as Locator;
      }),
    } as unknown as Locator;
    const row = {
      getAttribute: vi
        .fn<Locator["getAttribute"]>()
        .mockImplementation(async (name) => (name === "id" ? "js-transaction-row-a" : "")),
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(cells),
    } as unknown as Locator;

    await expect(parseDetailRow(row, 2026)).resolves.toMatchObject({ description: "" });
  });

  test("内容欄の取得に失敗したら月次置換へ進まない", async () => {
    const texts = new Map([
      [1, "07/01"],
      [3, "1,000"],
    ]);
    const cells = {
      nth: vi.fn<(index: number) => Locator>((index) => {
        return {
          textContent: vi.fn<Locator["textContent"]>().mockImplementation(async () => {
            if (index === 2) throw new Error("Detached cell");
            return texts.get(index) ?? "";
          }),
        } as unknown as Locator;
      }),
    } as unknown as Locator;
    const row = {
      getAttribute: vi
        .fn<Locator["getAttribute"]>()
        .mockImplementation(async (name) => (name === "id" ? "js-transaction-row-a" : "")),
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(cells),
    } as unknown as Locator;

    await expect(parseDetailRow(row, 2026)).rejects.toThrow(
      "Incomplete cash flow transaction row (description)",
    );
  });

  test("必須セルを取得できない行があれば部分的な月次結果を返さない", async () => {
    const emptyCell = {
      textContent: vi.fn<Locator["textContent"]>().mockResolvedValue(""),
    } as unknown as Locator;
    const cells = {
      nth: vi.fn<(index: number) => Locator>().mockReturnValue(emptyCell),
    } as unknown as Locator;
    const row = {
      getAttribute: vi
        .fn<Locator["getAttribute"]>()
        .mockImplementation(async (name) => (name === "id" ? "js-transaction-row-a" : "")),
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(cells),
    } as unknown as Locator;

    await expect(parseDetailRow(row, 2026)).rejects.toThrow("Incomplete cash flow transaction row");
  });

  test("取引IDを取得できない行があれば月次置換へ進まない", async () => {
    const texts = new Map([
      [1, "2026/07/01"],
      [2, "Transaction A"],
      [3, "1,000"],
    ]);
    const cells = {
      nth: vi.fn<(index: number) => Locator>((index) => {
        return {
          textContent: vi.fn<Locator["textContent"]>().mockResolvedValue(texts.get(index) ?? ""),
        } as unknown as Locator;
      }),
    } as unknown as Locator;
    const row = {
      getAttribute: vi.fn<Locator["getAttribute"]>().mockResolvedValue(""),
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(cells),
    } as unknown as Locator;

    await expect(parseDetailRow(row, 2026)).rejects.toThrow("Incomplete cash flow transaction row");
  });

  test.each(["", "invalid", "02/30"])(
    "日付 %j を有効な日付として取得できない行があれば月次置換へ進まない",
    async (dateText) => {
      const texts = new Map([
        [1, dateText],
        [2, "Transaction A"],
        [3, "1,000"],
      ]);
      const cells = {
        nth: vi.fn<(index: number) => Locator>((index) => {
          return {
            textContent: vi.fn<Locator["textContent"]>().mockResolvedValue(texts.get(index) ?? ""),
          } as unknown as Locator;
        }),
      } as unknown as Locator;
      const row = {
        getAttribute: vi
          .fn<Locator["getAttribute"]>()
          .mockImplementation(async (name) => (name === "id" ? "js-transaction-row-a" : "")),
        locator: vi.fn<(selector: string) => Locator>().mockReturnValue(cells),
      } as unknown as Locator;

      await expect(parseDetailRow(row, 2026)).rejects.toThrow(
        "Incomplete cash flow transaction row",
      );
    },
  );

  test.each(["--", "取得中", "1,23"])(
    "金額 %j を数値として取得できない行があれば月次置換へ進まない",
    async (amountText) => {
      const texts = new Map([
        [1, "2026/07/01"],
        [2, "Transaction A"],
        [3, amountText],
      ]);
      const cells = {
        nth: vi.fn<(index: number) => Locator>((index) => {
          return {
            textContent: vi.fn<Locator["textContent"]>().mockResolvedValue(texts.get(index) ?? ""),
          } as unknown as Locator;
        }),
      } as unknown as Locator;
      const row = {
        getAttribute: vi
          .fn<Locator["getAttribute"]>()
          .mockImplementation(async (name) => (name === "id" ? "js-transaction-row-a" : "")),
        locator: vi.fn<(selector: string) => Locator>().mockReturnValue(cells),
      } as unknown as Locator;

      await expect(parseDetailRow(row, 2026)).rejects.toThrow(
        "Incomplete cash flow transaction row",
      );
    },
  );

  test.each([5, 6])(
    "カテゴリ列 %i の取得に失敗した行があれば月次置換へ進まない",
    async (failedColumn) => {
      const texts = new Map([
        [1, "2026/07/01"],
        [2, "Transaction A"],
        [3, "1,000"],
        [5, ""],
        [6, ""],
      ]);
      const cells = {
        nth: vi.fn<(index: number) => Locator>((index) => {
          return {
            textContent: vi.fn<Locator["textContent"]>().mockImplementation(async () => {
              if (index === failedColumn) throw new Error("Detached cell");
              return texts.get(index) ?? "";
            }),
          } as unknown as Locator;
        }),
      } as unknown as Locator;
      const row = {
        getAttribute: vi
          .fn<Locator["getAttribute"]>()
          .mockImplementation(async (name) => (name === "id" ? "js-transaction-row-a" : "")),
        locator: vi.fn<(selector: string) => Locator>().mockReturnValue(cells),
      } as unknown as Locator;

      await expect(parseDetailRow(row, 2026)).rejects.toThrow(
        "Incomplete cash flow transaction row",
      );
    },
  );

  test("行classの取得に失敗したら月次置換へ進まない", async () => {
    const texts = new Map([
      [1, "2026/07/01"],
      [2, "Transaction A"],
      [3, "1,000"],
    ]);
    const cells = {
      nth: vi.fn<(index: number) => Locator>((index) => {
        return {
          textContent: vi.fn<Locator["textContent"]>().mockResolvedValue(texts.get(index) ?? ""),
        } as unknown as Locator;
      }),
    } as unknown as Locator;
    const row = {
      getAttribute: vi.fn<Locator["getAttribute"]>().mockImplementation(async (name) => {
        if (name === "id") return "js-transaction-row-a";
        throw new Error("Detached row");
      }),
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(cells),
    } as unknown as Locator;

    await expect(parseDetailRow(row, 2026)).rejects.toThrow("Incomplete cash flow transaction row");
  });

  test("口座セルの取得に失敗したら月次置換へ進まない", async () => {
    const missingChild = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
    } as unknown as Locator;
    const accountCell = {
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(missingChild),
      textContent: vi.fn<Locator["textContent"]>().mockRejectedValue(new Error("Detached cell")),
    } as unknown as Locator;
    const texts = new Map([
      [1, "2026/07/01"],
      [2, "Transaction A"],
      [3, "1,000"],
      [5, "Category A"],
      [6, "Subcategory A"],
    ]);
    const cells = {
      nth: vi.fn<(index: number) => Locator>((index) => {
        if (index === 4) return accountCell;
        return {
          textContent: vi.fn<Locator["textContent"]>().mockResolvedValue(texts.get(index) ?? ""),
        } as unknown as Locator;
      }),
    } as unknown as Locator;
    const row = {
      getAttribute: vi
        .fn<Locator["getAttribute"]>()
        .mockImplementation(async (name) => (name === "id" ? "js-transaction-row-a" : "")),
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(cells),
    } as unknown as Locator;

    await expect(parseDetailRow(row, 2026)).rejects.toThrow("Incomplete cash flow transaction row");
  });
});
