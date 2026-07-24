import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  runAnalyticsPhase,
  runAuthPhase,
  runCashFlowHistoryPhase,
  runCleanupPhase,
  runInstitutionCategoryPhase,
  runLoadPhase,
  runNotificationPhase,
  runSavePhase,
  runScrapePhase,
  runSetupPhase,
} from "./crawler-phases.js";
import { CRAWLER_STEPS, createCrawlerProgressReporter } from "./crawler-progress.js";
import { runCrawler } from "./run.js";
import { createGroupScope } from "./scrapers/group.js";
import { notifyWebRefresh } from "./web-refresh.js";

vi.mock("@mf-dashboard/db", () => ({ closeDb: vi.fn<() => void>() }));
vi.mock("./crawler-phases.js", () => ({
  handleCrawlerFailure: vi.fn<() => void>(),
  runAnalyticsPhase: vi.fn<() => void>(),
  runAuthPhase: vi.fn<() => void>(),
  runCashFlowHistoryPhase: vi.fn<() => void>(),
  runCleanupPhase: vi.fn<() => void>(),
  runInstitutionCategoryPhase: vi.fn<() => void>(),
  runLoadPhase: vi.fn<() => void>(),
  runNotificationPhase: vi.fn<() => void>(),
  runSavePhase: vi.fn<() => void>(),
  runScrapePhase: vi.fn<() => void>(),
  runSetupPhase: vi.fn<() => void>(),
}));
vi.mock("./scrapers/group.js", () => ({ createGroupScope: vi.fn<() => void>() }));
vi.mock("./web-refresh.js", () => ({ notifyWebRefresh: vi.fn<() => void>() }));

let tempDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tempDir = await mkdtemp(path.join(os.tmpdir(), "crawler-run-progress-"));
  vi.mocked(runLoadPhase).mockReturnValue({
    skipRefresh: false,
    cleanupGroups: false,
    authState: "configured",
    dbPath: "/tmp/demo.db",
    dbExists: true,
    scrapeMode: "month",
    isHistoryMode: false,
    isDebug: false,
    isHeaded: false,
  });
  vi.mocked(runSetupPhase).mockResolvedValue({
    db: {} as never,
    browser: { close: vi.fn<() => Promise<void>>() } as never,
    context: {} as never,
    page: {} as never,
    categoryDecision: { config: null, usage: { llmCallsUsed: 0 } },
  });
  vi.mocked(createGroupScope).mockResolvedValue({
    originalGroup: null,
    [Symbol.asyncDispose]: vi.fn<() => Promise<void>>(),
  });
  vi.mocked(runNotificationPhase).mockResolvedValue(null);
  vi.mocked(notifyWebRefresh).mockResolvedValue(undefined);
  vi.mocked(runSavePhase).mockResolvedValue([]);
  vi.mocked(runCashFlowHistoryPhase).mockImplementation(
    async (_db, _page, _config, _categoryDecision, _progress, publishHistory) => {
      if (!publishHistory) throw new Error("publishHistory is required");
      await publishHistory([]);
    },
  );
  vi.mocked(runScrapePhase).mockImplementation(async (_page, _config, progress) => {
    for (const [step, metadata] of [
      [CRAWLER_STEPS.groupList],
      [CRAWLER_STEPS.refresh],
      [CRAWLER_STEPS.registeredAccounts],
      [CRAWLER_STEPS.portfolio],
      [CRAWLER_STEPS.liabilities],
      [CRAWLER_STEPS.monthlyCashFlow, { month: "2026-07" }],
      [CRAWLER_STEPS.groupData, { groupName: "Group A" }],
    ] as const) {
      const stepId = await progress.startStep(step, metadata);
      await progress.completeStep(stepId);
    }
    return {
      defaultGroup: null,
      globalData: {
        registeredAccounts: { accounts: [] },
        portfolio: { items: [], totalAssets: 0 },
        liabilities: { items: [], totalLiabilities: 0 },
        cashFlow: {
          month: "2026-07",
          totalIncome: 0,
          totalExpense: 0,
          balance: 0,
          items: [],
        },
        refreshResult: { completed: true, incompleteAccounts: [] },
      },
      groupDataList: [],
    };
  });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("runCrawler progress", () => {
  test("group cleanup 失敗を database save step に記録する", async () => {
    const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
      id: "run-a",
      source: "test",
      startedAt: "2026-07-01T00:00:00.000Z",
    });
    vi.mocked(runCleanupPhase).mockRejectedValueOnce(new Error("database cleanup failed"));

    await expect(runCrawler(progress)).rejects.toThrow("database cleanup failed");

    expect(progress.getState().timeline).toContainEqual(
      expect.objectContaining({ step: "database_save", status: "failed" }),
    );
  });

  test("通常成功でユーザー向けの全 step を順に記録する", async () => {
    const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
      id: "run-a",
      source: "test",
      startedAt: "2026-07-01T00:00:00.000Z",
    });

    await runCrawler(progress);
    await progress.finish("success");

    expect(progress.getState().runStatus).toBe("success");
    expect(progress.getState().timeline.map(({ step, status }) => ({ step, status }))).toEqual([
      { step: "authentication", status: "done" },
      { step: "group_list", status: "done" },
      { step: "moneyforward_refresh", status: "done" },
      { step: "registered_accounts", status: "done" },
      { step: "portfolio", status: "done" },
      { step: "liabilities", status: "done" },
      { step: "cash_flow_history", status: "done" },
      { step: "group_data", status: "done" },
      { step: "database_save", status: "done" },
      { step: "institution_categories", status: "done" },
      { step: "analytics", status: "done" },
      { step: "notification", status: "done" },
      { step: "web_cache_refresh", status: "done" },
    ]);
    expect(runAuthPhase).toHaveBeenCalledOnce();
    expect(runSavePhase).toHaveBeenCalledOnce();
    expect(runCleanupPhase).toHaveBeenCalledOnce();
    expect(runInstitutionCategoryPhase).toHaveBeenCalledOnce();
    expect(runCashFlowHistoryPhase).toHaveBeenCalledOnce();
    expect(runAnalyticsPhase).toHaveBeenCalledOnce();
  });

  test("history replacementsをcurrent dataと同じsave phaseへ渡す", async () => {
    vi.mocked(runLoadPhase).mockReturnValue({
      skipRefresh: false,
      cleanupGroups: false,
      authState: "configured",
      dbPath: "/tmp/demo.db",
      dbExists: true,
      scrapeMode: "history",
      isHistoryMode: true,
      isDebug: false,
      isHeaded: false,
    });
    const historyMonths = [{ items: [], month: "2026-06" }];
    vi.mocked(runCashFlowHistoryPhase).mockImplementation(
      async (_db, _page, _config, _categoryDecision, _progress, publishHistory) => {
        if (!publishHistory) throw new Error("publishHistory is required");
        await publishHistory(historyMonths);
      },
    );
    const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
      id: "run-a",
      source: "test",
      startedAt: "2026-07-01T00:00:00.000Z",
    });

    await runCrawler(progress);

    expect(runSavePhase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      historyMonths,
    );
  });
});
