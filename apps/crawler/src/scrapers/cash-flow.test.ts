import { getJstYearMonthKey } from "@mf-dashboard/date-utils";
import type { Locator, Page, Response } from "playwright";
import { describe, expect, test, vi } from "vitest";
import { getCashFlow, parseCashFlowMonthCsvHref, parseCashFlowMonthHeader } from "./cash-flow.js";

describe("parseCashFlowMonthHeader", () => {
  test.each([
    ["2026年8月", "2026-08"],
    [" 2025年12月 ", "2025-12"],
    ["2026/8/1 - 2026/8/31", "2026-08"],
  ])("%j から対象月を取得する", (header, expected) => {
    expect(parseCashFlowMonthHeader(header)).toBe(expected);
  });

  test.each([null, "", "2026-08", "2026年0月", "2026年13月", "2026/13/1 - 2026/13/31"])(
    "%j は対象月として扱わない",
    (header) => {
      expect(parseCashFlowMonthHeader(header)).toBeNull();
    },
  );
});

describe("parseCashFlowMonthCsvHref", () => {
  test.each([
    [null, null],
    ["/cf/csv?year=2026", null],
    ["/cf/csv?year=2026&month=0", null],
    ["/cf/csv?year=2026&month=13", null],
    ["/cf/csv?year=2026&month=8", "2026-08"],
  ])("%s を %s として解釈する", (href, expected) => {
    expect(parseCashFlowMonthCsvHref(href)).toBe(expected);
  });
});

describe("getCashFlow", () => {
  test("当月取得AJAXのDOM適用完了を待ってから結果を返す", async () => {
    const currentMonth = getJstYearMonthKey();
    const [year, month] = currentMonth.split("-");
    const events: string[] = [];

    let monthHeader: Locator;
    monthHeader = {
      first: vi.fn<() => Locator>(() => monthHeader),
      count: vi.fn<() => Promise<number>>().mockResolvedValue(1),
      textContent: vi
        .fn<() => Promise<string | null>>()
        .mockResolvedValueOnce("2000/1/1 - 2000/1/31")
        .mockResolvedValueOnce(`${year}/${Number(month)}/1 - ${year}/${Number(month)}/28`),
    } as unknown as Locator;

    let csvLink: Locator;
    csvLink = {
      first: vi.fn<() => Locator>(() => csvLink),
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
    } as unknown as Locator;

    const detailTable = {
      waitFor: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as Locator;
    let todayButton: Locator;
    todayButton = {
      first: vi.fn<() => Locator>(() => todayButton),
      isVisible: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
      click: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
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
      count: vi.fn<() => Promise<number>>().mockImplementation(async () => {
        events.push("detail-read");
        return 0;
      }),
    } as unknown as Locator;

    const fetchResponse = {
      finished: vi.fn<Response["finished"]>().mockResolvedValue(null),
    } as unknown as Response;
    const evaluate = vi
      .fn<(callback: unknown, argument: string) => Promise<void>>()
      .mockImplementation(async () => {
        events.push(evaluate.mock.calls.length === 1 ? "ajax-wait-installed" : "ajax-wait-cleaned");
      });
    const waitForFunction = vi
      .fn<(callback: unknown, argument: string) => Promise<void>>()
      .mockImplementation(async () => {
        events.push(waitForFunction.mock.calls.length === 1 ? "ajax-applied" : "month-updated");
      });
    const locator = vi.fn<(selector: string) => Locator>().mockImplementation((selector) => {
      if (selector === "#cf-detail-table") return detailTable;
      if (selector === ".fc-header-title h2") return monthHeader;
      if (selector === "a[href*='/cf/csv']") return csvLink;
      if (selector === ".fc-button-today") return todayButton;
      if (selector === "#monthly_total_table_kakeibo tbody tr") return summaryRows;
      if (selector === "#cf-detail-table tbody > tr") return detailRows;
      throw new Error(`Unexpected selector: ${selector}`);
    });
    const page = {
      goto: vi.fn<() => Promise<null>>().mockResolvedValue(null),
      locator,
      evaluate,
      waitForResponse: vi.fn<() => Promise<Response>>().mockResolvedValue(fetchResponse),
      waitForFunction,
    } as unknown as Page;

    await expect(getCashFlow(page)).resolves.toMatchObject({ month: currentMonth, items: [] });
    expect(waitForFunction.mock.calls.map((call) => call[1])).toEqual([
      "__mfDashboardCashFlowAjax",
      currentMonth,
    ]);
    expect(events).toEqual([
      "ajax-wait-installed",
      "ajax-applied",
      "ajax-wait-cleaned",
      "month-updated",
      "detail-read",
    ]);
  });
});
