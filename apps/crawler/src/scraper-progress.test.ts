import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createCrawlerProgressReporter } from "./crawler-progress.js";
import { scrapeAllGroups } from "./scraper.js";
import { getAssetHistory } from "./scrapers/asset-history.js";
import { getAssetItems } from "./scrapers/asset-items.js";
import { getAssetSummary } from "./scrapers/asset-summary.js";
import { getCashFlow } from "./scrapers/cash-flow.js";
import { getAllGroups, getCurrentGroup, switchGroup } from "./scrapers/group.js";
import { getLiabilities } from "./scrapers/liabilities.js";
import { getPortfolio } from "./scrapers/portfolio.js";
import { clickRefreshButton } from "./scrapers/refresh.js";
import { getRegisteredAccounts } from "./scrapers/registered-accounts.js";
import { getSpendingTargets } from "./scrapers/spending-targets.js";

vi.mock("./scrapers/asset-history.js", () => ({ getAssetHistory: vi.fn<() => void>() }));
vi.mock("./scrapers/asset-items.js", () => ({ getAssetItems: vi.fn<() => void>() }));
vi.mock("./scrapers/asset-summary.js", () => ({ getAssetSummary: vi.fn<() => void>() }));
vi.mock("./scrapers/cash-flow.js", () => ({ getCashFlow: vi.fn<() => void>() }));
vi.mock("./scrapers/group.js", () => ({
  NO_GROUP_ID: "0",
  isNoGroup: (id: string) => id === "0",
  getAllGroups: vi.fn<() => void>(),
  getCurrentGroup: vi.fn<() => void>(),
  switchGroup: vi.fn<() => void>(),
}));
vi.mock("./scrapers/liabilities.js", () => ({ getLiabilities: vi.fn<() => void>() }));
vi.mock("./scrapers/portfolio.js", () => ({ getPortfolio: vi.fn<() => void>() }));
vi.mock("./scrapers/refresh.js", () => ({
  clickRefreshButton: vi.fn<() => void>(),
  getMaxWaitMinutes: () => 20,
}));
vi.mock("./scrapers/registered-accounts.js", () => ({
  getRegisteredAccounts: vi.fn<() => void>(),
}));
vi.mock("./scrapers/spending-targets.js", () => ({
  getSpendingTargets: vi.fn<() => void>(),
}));

let tempDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tempDir = await mkdtemp(path.join(os.tmpdir(), "crawler-scraper-progress-"));
  vi.mocked(getCurrentGroup).mockResolvedValue(null);
  vi.mocked(getAllGroups).mockResolvedValue([{ id: "group-a", name: "Group A", isCurrent: false }]);
  vi.mocked(clickRefreshButton).mockResolvedValue({
    completed: false,
    incompleteAccounts: ["Institution A", "Institution B"],
  });
  vi.mocked(getRegisteredAccounts).mockResolvedValue({ accounts: [] });
  vi.mocked(getPortfolio).mockResolvedValue({ items: [], totalAssets: 0 });
  vi.mocked(getLiabilities).mockResolvedValue({ items: [], totalLiabilities: 0 });
  vi.mocked(getCashFlow).mockResolvedValue({
    month: "2026-07",
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    items: [],
  });
  vi.mocked(getAssetSummary).mockResolvedValue({
    totalAssets: "0",
    dailyChange: "0",
    dailyChangePercent: "0%",
    monthlyChange: "0",
    monthlyChangePercent: "0%",
  });
  vi.mocked(getAssetItems).mockResolvedValue([]);
  vi.mocked(getAssetHistory).mockResolvedValue({ points: [] });
  vi.mocked(getSpendingTargets).mockResolvedValue({ categories: [] });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("scraper progress", () => {
  test("group discovery 失敗を全体データ step に記録する", async () => {
    const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
      id: "run-a",
      source: "test",
      startedAt: "2026-07-01T00:00:00.000Z",
    });
    vi.mocked(getAllGroups).mockRejectedValueOnce(new Error("page closed"));

    await expect(
      scrapeAllGroups({} as Parameters<typeof scrapeAllGroups>[0], progress),
    ).rejects.toThrow("page closed");

    expect(progress.getState().timeline).toContainEqual(
      expect.objectContaining({ step: "global_data", status: "failed" }),
    );
    expect(switchGroup).not.toHaveBeenCalled();
  });

  test("初期 group 切り替え失敗を全体データ step に記録する", async () => {
    const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
      id: "run-a",
      source: "test",
      startedAt: "2026-07-01T00:00:00.000Z",
    });
    vi.mocked(switchGroup).mockRejectedValueOnce(new Error("selector not found"));

    await expect(
      scrapeAllGroups({} as Parameters<typeof scrapeAllGroups>[0], progress),
    ).rejects.toThrow("selector not found");

    expect(progress.getState().timeline).toContainEqual(
      expect.objectContaining({
        step: "global_data",
        status: "failed",
        reason: expect.objectContaining({ code: "selector_not_found" }),
      }),
    );
    expect(clickRefreshButton).not.toHaveBeenCalled();
  });

  test("SKIP_REFRESH の refresh step を skipped にする", async () => {
    const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
      id: "run-a",
      source: "test",
      startedAt: "2026-07-01T00:00:00.000Z",
    });

    await scrapeAllGroups({} as Parameters<typeof scrapeAllGroups>[0], progress, {
      skipRefresh: true,
    });

    expect(progress.getState().timeline).toContainEqual(
      expect.objectContaining({ step: "moneyforward_refresh", status: "skipped" }),
    );
    expect(clickRefreshButton).not.toHaveBeenCalled();
  });

  test("group 切り替え失敗を対象 group name の failed step にする", async () => {
    const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
      id: "run-a",
      source: "test",
      startedAt: "2026-07-01T00:00:00.000Z",
    });
    vi.mocked(switchGroup)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("selector not found"));

    await expect(
      scrapeAllGroups({} as Parameters<typeof scrapeAllGroups>[0], progress),
    ).rejects.toThrow("selector not found");

    expect(progress.getState().timeline).toContainEqual(
      expect.objectContaining({
        step: "group_data",
        status: "failed",
        metadata: { kind: "group", groupName: "Group A" },
        reason: expect.objectContaining({ code: "selector_not_found" }),
      }),
    );
  });

  test("refresh timeout を warning にし、未完了機関と group name を保持する", async () => {
    const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
      id: "run-a",
      source: "test",
      startedAt: "2026-07-01T00:00:00.000Z",
    });
    let waitingState = progress.getState();
    vi.mocked(clickRefreshButton).mockImplementation(async (_page, options) => {
      await options?.onWaiting?.({
        elapsedSeconds: 30,
        incompleteAccounts: ["Institution A", "Institution B"],
        maxWaitMinutes: 20,
        nextCheckSeconds: 30,
        remainingCount: 2,
      });
      waitingState = progress.getState();
      return {
        completed: false,
        incompleteAccounts: ["Institution A", "Institution B"],
      };
    });

    await scrapeAllGroups({} as Parameters<typeof scrapeAllGroups>[0], progress);

    expect(waitingState).toMatchObject({
      waitingFor: "更新中の金融機関が0件になるのを待機",
      current: {
        step: "moneyforward_refresh",
        metadata: expect.objectContaining({
          kind: "refresh",
          maxWaitMinutes: 20,
          remainingAccounts: 2,
          incompleteAccounts: ["Institution A", "Institution B"],
        }),
      },
    });
    expect(progress.getState().timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "moneyforward_refresh",
          status: "warning",
          reason: expect.objectContaining({ code: "refresh_timeout" }),
          metadata: expect.objectContaining({
            kind: "refresh",
            maxWaitMinutes: 20,
            remainingAccounts: 2,
            incompleteAccounts: ["Institution A", "Institution B"],
          }),
        }),
        expect.objectContaining({
          step: "group_data",
          status: "done",
          metadata: { kind: "group", groupName: "Group A" },
        }),
      ]),
    );
  });
});
