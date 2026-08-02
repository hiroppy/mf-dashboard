import { mfUrls } from "@mf-dashboard/meta/urls";
import type { Locator, Page } from "playwright";
import { describe, expect, test, vi } from "vitest";
import {
  buildMonthRange,
  extractCashFlowFromPage,
  isSupportedCashFlowAmount,
  parseDetailRow,
  scrapeCashFlowHistory,
  scrapeCashFlowMonth,
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

describe("scrapeCashFlowHistory", () => {
  test("前月 navigation の失敗を対象月の callback に通知する", async () => {
    const detailTable = {
      waitFor: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as Locator;
    let csvLink: Locator;
    csvLink = {
      first: vi.fn<() => Locator>(() => csvLink),
      count: vi.fn<() => Promise<number>>().mockResolvedValue(1),
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
    const page = {
      locator: vi.fn<(selector: string) => Locator>().mockImplementation((selector) => {
        if (selector === ".fc-header-title h2") return monthHeader;
        if (selector === "#monthly_total_table_kakeibo tbody tr") return summaryRows;
        if (selector === "#cf-detail-table tbody > tr") return detailRows;
        return {
          count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
        } as unknown as Locator;
      }),
    } as unknown as Page;

    await expect(extractCashFlowFromPage(page)).rejects.toThrow(
      "Incomplete cash flow transaction row",
    );
  });
});

describe("scrapeCashFlowMonth", () => {
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

  test("指定月範囲へ遷移し、詳細テーブルを待ってから抽出する", async () => {
    const waitFor = vi.fn<Locator["waitFor"]>().mockResolvedValue(undefined);
    const detailTable = { waitFor } as unknown as Locator;
    let csvLink: Locator;
    const csvFirst = vi.fn<() => Locator>();
    csvLink = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(1),
      first: csvFirst,
      getAttribute: vi
        .fn<(name: string) => Promise<string | null>>()
        .mockResolvedValue("/cf/csv?year=2024&month=2"),
    } as unknown as Locator;
    csvFirst.mockReturnValue(csvLink);

    let missing: Locator;
    const missingFirst = vi.fn<() => Locator>();
    missing = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
      first: missingFirst,
    } as unknown as Locator;
    missingFirst.mockReturnValue(missing);

    const amountCell = {
      textContent: vi.fn<() => Promise<string | null>>().mockResolvedValue("0"),
    } as unknown as Locator;
    const summaryCells = {
      nth: vi.fn<(index: number) => Locator>().mockReturnValue(amountCell),
    } as unknown as Locator;
    const summaryRow = {
      locator: vi.fn<(selector: string) => Locator>().mockReturnValue(summaryCells),
    } as unknown as Locator;
    const summary = {
      first: vi.fn<() => Locator>().mockReturnValue(summaryRow),
    } as unknown as Locator;
    const detailRows = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
    } as unknown as Locator;

    const goto = vi.fn<Page["goto"]>().mockResolvedValue(null);
    const locator = vi.fn<Page["locator"]>((selector: string) => {
      if (selector === "#cf-detail-table") return detailTable;
      if (selector === "a[href*='/cf/csv']") return csvLink;
      if (selector === "#monthly_total_table_kakeibo tbody tr") return summary;
      if (selector === "#cf-detail-table tbody > tr") return detailRows;
      return missing;
    });
    const page = { goto, locator } as unknown as Page;

    await expect(scrapeCashFlowMonth(page, "2024-02")).resolves.toEqual({
      month: "2024-02",
      totalIncome: 0,
      totalExpense: 0,
      balance: 0,
      items: [],
    });
    expect(goto).toHaveBeenCalledWith(mfUrls.cashFlowWithRange("2024/02/01", "2024/02/29"), {
      waitUntil: "domcontentloaded",
    });
    expect(waitFor).toHaveBeenCalledWith({ state: "visible", timeout: 10000 });
  });
});
