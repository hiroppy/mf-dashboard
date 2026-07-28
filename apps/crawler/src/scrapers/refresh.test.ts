import type { Page } from "playwright";
import { describe, expect, test, vi } from "vitest";
import {
  getMaxWaitMinutes,
  navigateToAccountsPage,
  summarizeRefreshRows,
  type RefreshStatusRow,
} from "./refresh.js";

describe("getMaxWaitMinutes", () => {
  test.each([undefined, "", "0", "-1", "Infinity", "NaN"])(
    "invalid MAX_WAIT_MINUTES=%s は default 値を返す",
    (value) => {
      expect(getMaxWaitMinutes({ MAX_WAIT_MINUTES: value })).toBe(20);
    },
  );

  test("有限の正数を返す", () => {
    expect(getMaxWaitMinutes({ MAX_WAIT_MINUTES: "12.5" })).toBe(12.5);
  });
});

describe("summarizeRefreshRows", () => {
  test.each<{
    expected: { incompleteAccounts: string[]; remainingCount: number };
    name: string;
    rows: RefreshStatusRow[];
  }>([
    {
      name: "更新中のアカウント名と件数を返す",
      rows: [
        { name: "Institution A", statuses: ["更新中"] },
        { name: "Institution B", statuses: ["正常"] },
        { name: "Institution C", statuses: ["更新中"] },
      ],
      expected: {
        incompleteAccounts: ["Institution A", "Institution C"],
        remainingCount: 2,
      },
    },
    {
      name: "複数の状態セルに更新中があれば1件として数える",
      rows: [{ name: "Institution A", statuses: ["更新中", "正常"] }],
      expected: { incompleteAccounts: ["Institution A"], remainingCount: 1 },
    },
    {
      name: "完全一致しない状態は更新中として数えない",
      rows: [
        { name: "Institution A", statuses: ["更新中 → 一時停止中"] },
        { name: "Institution B", statuses: ["再更新中"] },
      ],
      expected: { incompleteAccounts: [], remainingCount: 0 },
    },
    {
      name: "空の行一覧は0件を返す",
      rows: [],
      expected: { incompleteAccounts: [], remainingCount: 0 },
    },
    {
      name: "名称がない更新中行も件数には含める",
      rows: [{ name: null, statuses: [" 更新中 "] }],
      expected: { incompleteAccounts: [], remainingCount: 1 },
    },
  ])("$name", ({ rows, expected }) => {
    expect(summarizeRefreshRows(rows)).toEqual(expected);
  });
});

describe("navigateToAccountsPage", () => {
  test("accountsページへの遷移がERR_ABORTEDでも1回だけ再試行する", async () => {
    const goto = vi.fn<(...args: any[]) => any>().mockImplementationOnce(() => {
      throw new Error("page.goto: net::ERR_ABORTED at https://moneyforward.com/accounts");
    });
    const waitForLoadState = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const isClosed = vi.fn<(...args: any[]) => any>().mockReturnValue(false);

    const retryPage = {
      goto,
      waitForLoadState,
      waitForTimeout,
      isClosed,
    } as unknown as Page;

    await navigateToAccountsPage(retryPage);

    expect(goto).toHaveBeenCalledTimes(2);
    expect(waitForTimeout).toHaveBeenCalledWith(1000);
    expect(waitForLoadState).toHaveBeenCalledTimes(1);
  });
});
