import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildAccountIdMap } from "@mf-dashboard/db/repository/accounts";
import { saveScrapedDataBatch } from "@mf-dashboard/db/repository/save-scraped-data";
import {
  hasTransactionsForMonth,
  saveTransactionsForMonths,
} from "@mf-dashboard/db/repository/transactions";
import type { CashFlowSummary } from "@mf-dashboard/db/types";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { categorizeCashFlowMonth } from "./category-decision/categorize-cash-flow.js";
import {
  getDebugScreenshotPath,
  loadCrawlerConfig,
  runCashFlowHistoryPhase,
  runSavePhase,
  type CategoryDecisionRuntime,
} from "./crawler-phases.js";
import { createCrawlerProgressReporter } from "./crawler-progress.js";
import { buildGroupOnlyScrapedData, buildScrapedData } from "./data-builder.js";
import type { ScrapeResult } from "./scraper.js";
import { scrapeCashFlowHistory } from "./scrapers/cash-flow-history.js";
import { switchGroup } from "./scrapers/group.js";

vi.mock("./category-decision/categorize-cash-flow.js", () => ({
  categorizeCashFlowMonth: vi.fn<() => Promise<CashFlowSummary>>(),
}));

vi.mock("./data-builder.js", () => ({
  buildScrapedData: vi.fn<() => { kind: string }>(() => ({ kind: "full" })),
  buildGroupOnlyScrapedData: vi.fn<() => { kind: string }>(() => ({ kind: "group-only" })),
}));

vi.mock("@mf-dashboard/db/repository/accounts", () => ({
  buildAccountIdMap: vi.fn<() => Promise<Map<string, number>>>(),
  updateAccountCategory: vi.fn<() => Promise<void>>(),
}));

vi.mock("@mf-dashboard/db/repository/save-scraped-data", () => ({
  saveScrapedDataBatch: vi.fn<() => Promise<number[]>>(),
}));

vi.mock("@mf-dashboard/db/repository/transactions", () => ({
  hasTransactionsForMonth: vi.fn<() => Promise<boolean>>(),
  saveTransactionsForMonths: vi.fn<() => Promise<number[]>>(),
}));

vi.mock("./scrapers/cash-flow-history.js", () => ({
  scrapeCashFlowHistory: vi.fn<() => Promise<Array<{ month: string; data: CashFlowSummary }>>>(),
}));

vi.mock("./scrapers/group.js", () => ({
  NO_GROUP_ID: "0",
  isNoGroup: (groupId: string) => groupId === "0",
  switchGroup: vi.fn<() => Promise<void>>(),
}));

function cashFlow(month: string, description: string): CashFlowSummary {
  return {
    month,
    totalIncome: 0,
    totalExpense: 1200,
    balance: -1200,
    items: [
      {
        mfId: `${month}-${description}`,
        date: `${month}-01`,
        amount: 1200,
        type: "expense",
        accountName: "Account A",
        description,
        category: "未分類",
        subCategory: null,
        isTransfer: false,
        isExcludedFromCalculation: false,
      },
    ],
  };
}

function categoryDecisionRuntime(): CategoryDecisionRuntime {
  return {
    config: {
      llm: { enabled: false, maxPerRun: 5, minConfidence: 0.65 },
      rules: [{ descriptionContains: "Service A", category: "食費", subCategory: "食料品" }],
    },
    usage: { llmCallsUsed: 0 },
  };
}

function scrapeResult(cashFlowSummary: CashFlowSummary): ScrapeResult {
  return {
    defaultGroup: null,
    globalData: {
      registeredAccounts: { accounts: [] },
      portfolio: { items: [], totalAssets: 0 },
      liabilities: { items: [], totalLiabilities: 0 },
      cashFlow: cashFlowSummary,
      refreshResult: null,
    },
    groupDataList: [
      {
        group: { id: "0", name: "グループ選択なし", isCurrent: false },
        registeredAccounts: { accounts: [] },
        assetHistory: { points: [] },
        spendingTargets: null,
        summary: {
          totalAssets: "0",
          dailyChange: "0",
          dailyChangePercent: "0%",
          monthlyChange: "0",
          monthlyChangePercent: "0%",
        },
        items: [],
      },
      {
        group: { id: "group-a", name: "Group A", isCurrent: true },
        registeredAccounts: { accounts: [] },
        assetHistory: { points: [] },
        spendingTargets: null,
        summary: {
          totalAssets: "0",
          dailyChange: "0",
          dailyChangePercent: "0%",
          monthlyChange: "0",
          monthlyChangePercent: "0%",
        },
        items: [],
      },
    ],
  };
}

beforeEach(() => {
  vi.mocked(categorizeCashFlowMonth).mockReset();
  vi.mocked(buildScrapedData).mockClear();
  vi.mocked(buildGroupOnlyScrapedData).mockClear();
  vi.mocked(buildAccountIdMap).mockReset();
  vi.mocked(saveScrapedDataBatch).mockReset();
  vi.mocked(saveScrapedDataBatch).mockResolvedValue([]);
  vi.mocked(hasTransactionsForMonth).mockReset();
  vi.mocked(saveTransactionsForMonths).mockReset();
  vi.mocked(saveTransactionsForMonths).mockResolvedValue([]);
  vi.mocked(scrapeCashFlowHistory).mockReset();
  vi.mocked(switchGroup).mockReset();
});

describe("loadCrawlerConfig", () => {
  test("DBがある場合はmonth modeを既定にする", () => {
    const config = loadCrawlerConfig(
      {},
      () => true,
      () => true,
    );

    expect(config.scrapeMode).toBe("month");
    expect(config.isHistoryMode).toBe(false);
    expect(config.authState).toBe("configured");
  });

  test("DBがない場合はhistory modeを既定にする", () => {
    const config = loadCrawlerConfig(
      {},
      () => false,
      () => false,
    );

    expect(config.scrapeMode).toBe("history");
    expect(config.isHistoryMode).toBe(true);
    expect(config.authState).toBe("none");
  });

  test("環境変数の指定を優先する", () => {
    const env: NodeJS.ProcessEnv = {
      CLEANUP_GROUPS: "true",
      DB_PATH: "/tmp/test.db",
      DEBUG: "true",
      HEADED: "true",
      SCRAPE_MODE: "history",
      SKIP_REFRESH: "true",
    };

    const config = loadCrawlerConfig(
      env,
      (filePath) => filePath === "/tmp/test.db",
      () => false,
    );

    expect(config.skipRefresh).toBe(true);
    expect(config.cleanupGroups).toBe(true);
    expect(config.dbPath).toBe("/tmp/test.db");
    expect(config.dbExists).toBe(true);
    expect(config.scrapeMode).toBe("history");
    expect(config.isHistoryMode).toBe(true);
    expect(config.isDebug).toBe(true);
    expect(config.isHeaded).toBe(true);
  });
});

describe("getDebugScreenshotPath", () => {
  test("debug directory配下のerror画像パスを返す", () => {
    const debugDir = path.join("/tmp", "apps", "crawler", "debug");

    expect(getDebugScreenshotPath(1234567890, debugDir)).toBe(
      path.join(debugDir, "error-1234567890.png"),
    );
  });
});

describe("runSavePhase", () => {
  test("カテゴリ決定が有効な場合は保存前に当月cash flowを分類する", async () => {
    const page = {};
    const db = {};
    const originalCashFlow = cashFlow("2026-06", "Service A");
    const categorizedCashFlow = {
      ...originalCashFlow,
      items: [
        {
          ...originalCashFlow.items[0]!,
          category: "食費",
          subCategory: "食料品",
        },
      ],
    };
    const categoryDecision = categoryDecisionRuntime();
    vi.mocked(categorizeCashFlowMonth).mockResolvedValue(categorizedCashFlow);

    await runSavePhase(
      db as Parameters<typeof runSavePhase>[0],
      page as Parameters<typeof runSavePhase>[1],
      scrapeResult(originalCashFlow),
      categoryDecision,
    );

    expect(switchGroup).toHaveBeenCalledWith(page, "0");
    expect(categorizeCashFlowMonth).toHaveBeenCalledWith({
      page,
      db,
      cashFlow: originalCashFlow,
      config: categoryDecision.config,
      usage: categoryDecision.usage,
    });
    expect(buildScrapedData).toHaveBeenCalledWith(
      expect.objectContaining({ cashFlow: categorizedCashFlow }),
      expect.objectContaining({ group: expect.objectContaining({ id: "0" }) }),
    );
    expect(saveScrapedDataBatch).toHaveBeenCalledWith(db, {
      cleanupGroupIds: undefined,
      fullData: { kind: "full" },
      groupOnlyData: [{ kind: "group-only" }],
      historyMonths: [],
    });
  });
});

describe("runCashFlowHistoryPhase", () => {
  test("初期 navigation 失敗を対象月 step に記録する", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "crawler-history-setup-failure-"));
    try {
      const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
        id: "run-a",
        source: "test",
        startedAt: "2026-07-01T00:00:00.000Z",
      });
      vi.mocked(buildAccountIdMap).mockResolvedValue(new Map());
      vi.mocked(hasTransactionsForMonth).mockResolvedValue(true);
      vi.mocked(switchGroup).mockRejectedValueOnce(new Error("navigation failed"));

      await expect(
        runCashFlowHistoryPhase(
          {} as never,
          {} as never,
          { isHistoryMode: true },
          undefined,
          progress,
        ),
      ).rejects.toThrow("navigation failed");

      expect(progress.getState().timeline).toEqual([
        expect.objectContaining({
          step: "cash_flow_history",
          status: "failed",
          metadata: expect.objectContaining({
            kind: "month",
            month: expect.stringMatching(/^\d{4}-\d{2}$/),
          }),
        }),
      ]);
      expect(scrapeCashFlowHistory).not.toHaveBeenCalled();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("表示月と抽出月が異なっても開始済み month step を完了する", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "crawler-history-month-key-"));
    try {
      const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
        id: "run-a",
        source: "test",
        startedAt: "2026-07-01T00:00:00.000Z",
      });
      const monthData = cashFlow("2026-05", "Service A");
      vi.mocked(buildAccountIdMap).mockResolvedValue(new Map());
      vi.mocked(hasTransactionsForMonth).mockResolvedValue(true);
      vi.mocked(scrapeCashFlowHistory).mockImplementation(async (_page, _months, callbacks) => {
        await callbacks?.onMonthStart?.("2026-06");
        return [{ month: "2026-05", progressMonth: "2026-06", data: monthData }];
      });
      vi.mocked(saveTransactionsForMonths).mockResolvedValue([1]);

      await runCashFlowHistoryPhase(
        {} as never,
        {} as never,
        { isHistoryMode: true },
        undefined,
        progress,
      );

      expect(progress.getState().timeline).toEqual([
        expect.objectContaining({
          status: "done",
          metadata: { kind: "month", month: "2026-06" },
        }),
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("後続月の取得失敗時に未保存の月 step をすべて failed にする", async () => {
    const page = {};
    const db = {};
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "crawler-history-later-failure-"));
    try {
      const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
        id: "run-a",
        source: "test",
        startedAt: "2026-07-01T00:00:00.000Z",
      });
      vi.mocked(buildAccountIdMap).mockResolvedValue(new Map());
      vi.mocked(hasTransactionsForMonth).mockResolvedValue(false);
      vi.mocked(scrapeCashFlowHistory).mockImplementation(async (_page, _months, callbacks) => {
        await callbacks?.onMonthStart?.("2026-06");
        await callbacks?.onMonthComplete?.("2026-06");
        await callbacks?.onMonthStart?.("2026-05");
        const failure = new Error("history page unavailable");
        await callbacks?.onMonthFailure?.("2026-05", failure);
        throw failure;
      });

      await expect(
        runCashFlowHistoryPhase(
          db as Parameters<typeof runCashFlowHistoryPhase>[0],
          page as Parameters<typeof runCashFlowHistoryPhase>[1],
          { isHistoryMode: true },
          undefined,
          progress,
        ),
      ).rejects.toThrow("history page unavailable");

      expect(progress.getState().timeline).toEqual([
        expect.objectContaining({
          status: "failed",
          metadata: { kind: "month", month: "2026-06" },
        }),
        expect.objectContaining({
          status: "failed",
          metadata: { kind: "month", month: "2026-05" },
        }),
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("履歴月の保存失敗を対象月の failed step にする", async () => {
    const page = {};
    const db = {};
    const monthData = cashFlow("2026-06", "Service A");
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "crawler-history-failure-"));
    try {
      const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
        id: "run-a",
        source: "test",
        startedAt: "2026-07-01T00:00:00.000Z",
      });
      vi.mocked(buildAccountIdMap).mockResolvedValue(new Map());
      vi.mocked(hasTransactionsForMonth).mockResolvedValue(true);
      vi.mocked(scrapeCashFlowHistory).mockImplementation(async (_page, _months, callbacks) => {
        await callbacks?.onMonthStart?.("2026-06");
        return [{ month: "2026-06", data: monthData }];
      });
      vi.mocked(saveTransactionsForMonths).mockRejectedValue(new Error("database unavailable"));

      await expect(
        runCashFlowHistoryPhase(
          db as Parameters<typeof runCashFlowHistoryPhase>[0],
          page as Parameters<typeof runCashFlowHistoryPhase>[1],
          { isHistoryMode: true },
          undefined,
          progress,
        ),
      ).rejects.toThrow("database unavailable");

      expect(progress.getState().timeline).toEqual([
        expect.objectContaining({
          step: "cash_flow_history",
          status: "failed",
          metadata: { kind: "month", month: "2026-06" },
        }),
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("history mode の各対象月を YYYY-MM metadata として記録する", async () => {
    const page = {};
    const db = {};
    const monthData = cashFlow("2026-06", "Service A");
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "crawler-history-progress-"));
    try {
      const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
        id: "run-a",
        source: "test",
        startedAt: "2026-07-01T00:00:00.000Z",
      });
      vi.mocked(buildAccountIdMap).mockResolvedValue(new Map());
      vi.mocked(hasTransactionsForMonth).mockResolvedValue(true);
      vi.mocked(scrapeCashFlowHistory).mockImplementation(async (_page, _months, callbacks) => {
        await callbacks?.onMonthStart?.("2026-06");
        await callbacks?.onMonthComplete?.("2026-06");
        return [{ month: "2026-06", data: monthData }];
      });
      vi.mocked(saveTransactionsForMonths).mockResolvedValue([1]);

      await runCashFlowHistoryPhase(
        db as Parameters<typeof runCashFlowHistoryPhase>[0],
        page as Parameters<typeof runCashFlowHistoryPhase>[1],
        { isHistoryMode: true },
        undefined,
        progress,
      );

      expect(progress.getState().timeline).toEqual([
        expect.objectContaining({
          step: "cash_flow_history",
          status: "done",
          metadata: { kind: "month", month: "2026-06" },
        }),
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("カテゴリ決定が有効な場合は履歴月を分類してから取引保存する", async () => {
    const page = {};
    const db = {};
    const originalCashFlow = cashFlow("2026-06", "Service A");
    const categorizedCashFlow = {
      ...originalCashFlow,
      items: [
        {
          ...originalCashFlow.items[0]!,
          category: "食費",
          subCategory: "食料品",
        },
      ],
    };
    const accountIdMap = new Map([["account-a", 1]]);
    const categoryDecision = categoryDecisionRuntime();
    vi.mocked(buildAccountIdMap).mockResolvedValue(accountIdMap);
    vi.mocked(hasTransactionsForMonth).mockResolvedValue(true);
    vi.mocked(scrapeCashFlowHistory).mockResolvedValue([
      { month: "2026-06", data: originalCashFlow },
    ]);
    vi.mocked(categorizeCashFlowMonth).mockResolvedValue(categorizedCashFlow);
    vi.mocked(saveTransactionsForMonths).mockResolvedValue([1]);

    await runCashFlowHistoryPhase(
      db as Parameters<typeof runCashFlowHistoryPhase>[0],
      page as Parameters<typeof runCashFlowHistoryPhase>[1],
      { isHistoryMode: true },
      categoryDecision,
    );

    expect(categorizeCashFlowMonth).toHaveBeenCalledWith({
      page,
      db,
      cashFlow: originalCashFlow,
      config: categoryDecision.config,
      usage: categoryDecision.usage,
    });
    expect(saveTransactionsForMonths).toHaveBeenCalledWith(
      db,
      [{ items: categorizedCashFlow.items, month: "2026-06" }],
      accountIdMap,
    );
  });
});
