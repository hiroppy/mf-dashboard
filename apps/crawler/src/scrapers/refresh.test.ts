import type { Page } from "playwright";
import { afterEach, describe, expect, test, vi } from "vitest";
import { info } from "../logger.js";
import {
  clickRefreshButton,
  getMaxWaitMinutes,
  getRefreshStatus,
  navigateToAccountsPage,
  summarizeRefreshRows,
  type RefreshStatusRow,
} from "./refresh.js";

function diagnosticEventMethods() {
  return { on: vi.fn<() => void>(), off: vi.fn<() => void>() };
}

function navigationDecisions() {
  return vi
    .mocked(info)
    .mock.calls.map(([message]) => message)
    .filter(
      (message): message is string =>
        typeof message === "string" && message.startsWith("MF_CRAWLER_DIAGNOSTIC "),
    )
    .map((message) => JSON.parse(message.slice("MF_CRAWLER_DIAGNOSTIC ".length)))
    .filter((record) => record.event === "accounts_navigation_decision");
}

afterEach(() => vi.mocked(info).mockClear());

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
    {
      name: "空白のみの名称は除外し更新中行を件数には含める",
      rows: [{ name: " \t ", statuses: ["更新中"] }],
      expected: { incompleteAccounts: [], remainingCount: 1 },
    },
  ])("$name", ({ rows, expected }) => {
    expect(summarizeRefreshRows(rows)).toEqual(expected);
  });
});

describe("getRefreshStatus", () => {
  test("service linkがない更新中行は先頭セルの名称を使う", async () => {
    const statusCells = {
      allTextContents: vi.fn<() => Promise<string[]>>().mockResolvedValue(["更新中"]),
    };
    const nameLink = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(0),
    };
    const firstCell = {
      textContent: vi.fn<() => Promise<string | null>>().mockResolvedValue(" Institution A "),
    };
    const allCells = {
      first: vi.fn<() => typeof firstCell>().mockReturnValue(firstCell),
    };
    const nameLinkLocator = {
      first: vi.fn<() => typeof nameLink>().mockReturnValue(nameLink),
    };
    const row = {
      locator: vi.fn<
        (selector: string) => typeof statusCells | typeof nameLinkLocator | typeof allCells
      >((selector) => {
        if (selector === "td.account-status") return statusCells;
        if (selector === "td.service a") return nameLinkLocator;
        return allCells;
      }),
    };
    const rows = {
      count: vi.fn<() => Promise<number>>().mockResolvedValue(1),
      nth: vi.fn<() => typeof row>().mockReturnValue(row),
    };
    const page = {
      ...diagnosticEventMethods(),
      locator: vi.fn<() => typeof rows>().mockReturnValue(rows),
    } as unknown as Page;

    await expect(getRefreshStatus(page)).resolves.toEqual({
      incompleteAccounts: ["Institution A"],
      remainingCount: 1,
    });
    expect(firstCell.textContent).toHaveBeenCalledOnce();
  });
});

describe("navigateToAccountsPage", () => {
  test.each([
    "page.goto: net::ERR_ABORTED at https://moneyforward.com/accounts",
    "page.goto: Timeout 30000ms exceeded.",
  ])("一時的な遷移エラーを1回だけ再試行する: %s", async (message) => {
    const goto = vi
      .fn<(...args: any[]) => any>()
      .mockRejectedValueOnce(new Error(message))
      .mockResolvedValueOnce(null);
    const isClosed = vi.fn<(...args: any[]) => any>().mockReturnValue(false);
    const retryPage = { ...diagnosticEventMethods(), goto, isClosed } as unknown as Page;

    await navigateToAccountsPage(retryPage, { retryDelayMs: 0 });

    expect(goto).toHaveBeenCalledTimes(2);
    expect(goto).toHaveBeenCalledWith(
      "https://moneyforward.com/accounts",
      expect.objectContaining({ timeout: 60000, waitUntil: "domcontentloaded" }),
    );
    expect(navigationDecisions()).toEqual([
      expect.objectContaining({
        decision: "retry",
        decision_reason: "retryable_error",
        attempt: 1,
        max_attempts: 2,
        retry_delay_ms: 0,
      }),
    ]);
  });

  test("Page crashedは再試行せず元のエラーを返す", async () => {
    const error = new Error("page.goto: Page crashed");
    const goto = vi.fn<(...args: any[]) => any>().mockRejectedValue(error);
    const page = {
      ...diagnosticEventMethods(),
      goto,
      isClosed: vi.fn<(...args: any[]) => any>().mockReturnValue(false),
    } as unknown as Page;

    await expect(navigateToAccountsPage(page, { retryDelayMs: 0 })).rejects.toBe(error);
    expect(goto).toHaveBeenCalledOnce();
    expect(navigationDecisions()).toEqual([
      expect.objectContaining({
        decision: "stop",
        decision_reason: "error_not_retryable",
        failure_kind: "page_crashed",
      }),
    ]);
  });

  test.each([
    ["Navigation is interrupted by another navigation", "navigation_interrupted"],
    ["Execution context was destroyed", "execution_context_destroyed"],
    ["Frame was detached", "frame_detached"],
    ["timeout 1000ms exceeded", "timeout"],
  ])("細分類を追加しても再試行対象は増やさない: %s", async (message, kind) => {
    const failure = new Error(message);
    const goto = vi.fn<Page["goto"]>().mockRejectedValue(failure);
    const page = { ...diagnosticEventMethods(), goto, isClosed: () => false } as unknown as Page;
    await expect(navigateToAccountsPage(page, { retryDelayMs: 0 })).rejects.toBe(failure);
    expect(goto).toHaveBeenCalledOnce();
    expect(navigationDecisions()).toEqual([
      expect.objectContaining({
        decision: "stop",
        decision_reason: "error_not_retryable",
        failure_kind: kind,
        retry_delay_ms: null,
      }),
    ]);
  });

  test.each(["net::ERR_ABORTED", "Timeout 60000ms exceeded"])(
    "再試行の上限と操作IDを記録する: %s",
    async (message) => {
      const failure = new Error(message);
      const goto = vi.fn<Page["goto"]>().mockRejectedValue(failure);
      const page = { ...diagnosticEventMethods(), goto, isClosed: () => false } as unknown as Page;
      await expect(navigateToAccountsPage(page, { retryDelayMs: 0 })).rejects.toBe(failure);
      expect(goto).toHaveBeenCalledTimes(2);
      const records = navigationDecisions();
      expect(records).toEqual([
        expect.objectContaining({
          attempt: 1,
          max_attempts: 2,
          decision: "retry",
          decision_reason: "retryable_error",
        }),
        expect.objectContaining({
          attempt: 2,
          max_attempts: 2,
          decision: "stop",
          decision_reason: "attempts_exhausted",
        }),
      ]);
      expect(records[0].operation_id).toBe(records[1].operation_id);
      expect(records[0].operation_id).toMatch(/^[a-f0-9-]{36}$/);
    },
  );

  test("閉じたページは再試行対象のエラーでも停止理由を記録する", async () => {
    const failure = new Error("net::ERR_ABORTED");
    const goto = vi.fn<Page["goto"]>().mockRejectedValue(failure);
    const page = { ...diagnosticEventMethods(), goto, isClosed: () => true } as unknown as Page;
    await expect(navigateToAccountsPage(page, { retryDelayMs: 0 })).rejects.toBe(failure);
    expect(goto).toHaveBeenCalledOnce();
    expect(navigationDecisions()).toEqual([
      expect.objectContaining({ decision: "stop", decision_reason: "page_closed" }),
    ]);
  });
});

describe("clickRefreshButton", () => {
  test("Modal Message iframe が出ていても閉じてから更新を押せる", async () => {
    const clicks: string[] = [];
    const refreshButton = {
      click: vi.fn<() => Promise<void>>(async () => {
        clicks.push("refresh");
      }),
    };
    const closeButton = {
      count: vi.fn<() => Promise<number>>(async () => 1),
      click: vi.fn<() => Promise<void>>(async () => {
        clicks.push("close");
      }),
    };
    const iframeLocator = {
      count: vi.fn<() => Promise<number>>(async () => 1),
    };
    const page = {
      ...diagnosticEventMethods(),
      goto: vi.fn<() => Promise<void>>(async () => undefined),
      waitForLoadState: vi.fn<() => Promise<void>>(async () => undefined),
      waitForTimeout: vi.fn<() => Promise<void>>(async () => undefined),
      locator: vi.fn<(selector: string) => unknown>((selector: string) => {
        if (selector === 'a:has-text("一括更新")') return { first: () => refreshButton };
        if (selector === 'iframe[title="Modal Message"]') return { first: () => iframeLocator };
        if (selector === "#account-table tr:has(td.account-status)")
          return { count: async () => 0 };
        throw new Error(`Unexpected locator: ${selector}`);
      }),
      frameLocator: vi.fn<() => unknown>(() => ({
        locator: vi.fn<(selector: string) => unknown>((selector: string) => ({
          first: () => {
            if (selector === 'button[aria-label="閉じる"]') return closeButton;
            return { count: async () => 0, click: async () => undefined };
          },
        })),
      })),
    } as unknown as Page;

    const result = await clickRefreshButton(page);

    expect(clicks).toEqual(["close", "refresh"]);
    expect(result).toEqual({ completed: true, incompleteAccounts: [] });
  });
});
