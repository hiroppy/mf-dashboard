import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Browser, BrowserContext } from "playwright";
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { createCrawlerProgressReporter } from "../../src/crawler-progress.js";
import type { ScrapeResult } from "../../src/scraper.js";
import { scrapeAllGroups } from "../../src/scraper.js";
import { isNoGroup } from "../../src/scrapers/group.js";
import { createAnonymousGroupScope } from "./group-state.js";
import {
  gotoHome,
  launchLoggedInContext,
  saveScreenshot,
  withErrorScreenshot,
  withNewPage,
} from "./helpers.js";

let browser: Browser;
let context: BrowserContext;
let result: ScrapeResult;
const progressStatePath = path.join(os.tmpdir(), `scrape-all-groups-${randomUUID()}.json`);

beforeAll(async () => {
  ({ browser, context } = await launchLoggedInContext());
  result = await withNewPage(context, async (page) => {
    await gotoHome(page);
    await saveScreenshot(page, "scrape-all-groups-test-before-scrape.png");

    return withErrorScreenshot(page, "scrape-all-groups-test-error.png", async () => {
      await using _scope = await createAnonymousGroupScope(page);
      const progress = await createCrawlerProgressReporter(progressStatePath, {
        id: randomUUID(),
        source: "e2e",
        startedAt: new Date().toISOString(),
      });
      return scrapeAllGroups(page, progress, { skipRefresh: true });
    });
  });
}, 300000);

afterAll(async () => {
  await context?.close();
  await browser?.close();
  await rm(progressStatePath, { force: true });
});

describe("scrapeAllGroups", () => {
  describe("ScrapeResult構造", () => {
    test("globalData, groupDataList, defaultGroupを返す", () => {
      expect(result.globalData).toBeDefined();
      expect(result.groupDataList).toBeDefined();
      expect(Array.isArray(result.groupDataList)).toBe(true);
    });

    test("defaultGroupがnullまたは有効なGroupオブジェクト", () => {
      const isValidDefaultGroup =
        result.defaultGroup === null ||
        (Boolean(result.defaultGroup.id) &&
          Boolean(result.defaultGroup.name) &&
          typeof result.defaultGroup.isCurrent === "boolean");

      expect(isValidDefaultGroup).toBe(true);
    });
  });

  describe("GlobalData (Phase 1)", () => {
    test("registeredAccountsが取得できる", () => {
      expect(result.globalData.registeredAccounts).toBeDefined();
      expect(result.globalData.registeredAccounts.accounts.length).toBeGreaterThan(0);
    });

    test("portfolioが取得できる", () => {
      expect(result.globalData.portfolio).toBeDefined();
      expect(result.globalData.portfolio.items.length).toBeGreaterThan(0);
    });

    test("liabilitiesが取得できる", () => {
      expect(result.globalData.liabilities).toBeDefined();
      expect(Array.isArray(result.globalData.liabilities.items)).toBe(true);
    });

    test("cashFlowが取得できる", () => {
      expect(result.globalData.cashFlow).toBeDefined();
      expect(result.globalData.cashFlow.month).toBeTruthy();
      expect(Array.isArray(result.globalData.cashFlow.items)).toBe(true);
    });

    test("refreshResultがnullまたは有効なオブジェクト", () => {
      // skipRefresh=trueなのでnullのはず
      expect(result.globalData.refreshResult).toBeNull();
    });
  });

  describe("GroupDataList (Phase 2)", () => {
    test("少なくとも1つのグループがある", () => {
      expect(result.groupDataList.length).toBeGreaterThan(0);
    });

    test("「グループ選択なし」が含まれる", () => {
      const noGroupData = result.groupDataList.find((gd) => isNoGroup(gd.group.id));
      expect(noGroupData).toBeDefined();
    });

    test("各グループにgroup情報がある", () => {
      for (const groupData of result.groupDataList) {
        expect(Boolean(groupData.group.id) && Boolean(groupData.group.name)).toBe(true);
        expect(typeof groupData.group.isCurrent).toBe("boolean");
      }
    });

    test("各グループにregisteredAccountsがある", () => {
      for (const groupData of result.groupDataList) {
        expect(groupData.registeredAccounts).toBeDefined();
        expect(Array.isArray(groupData.registeredAccounts.accounts)).toBe(true);
      }
    });

    test("各グループにassetHistoryがある", () => {
      for (const groupData of result.groupDataList) {
        expect(groupData.assetHistory).toBeDefined();
        expect(Array.isArray(groupData.assetHistory.points)).toBe(true);
      }
    });

    test("各グループにsummaryがある", () => {
      for (const groupData of result.groupDataList) {
        expect(groupData.summary).toBeDefined();
        expect(groupData.summary.totalAssets !== undefined).toBe(true);
      }
    });

    test("各グループにitemsがある", () => {
      for (const groupData of result.groupDataList) {
        expect(groupData.items).toBeDefined();
        expect(Array.isArray(groupData.items)).toBe(true);
      }
    });
  });

  describe("isCurrentフラグ", () => {
    test("正確に1つのグループがisCurrent=trueである", () => {
      const currentGroups = result.groupDataList.filter((gd) => gd.group.isCurrent);
      expect(currentGroups.length).toBe(1);
    });

    test("isCurrent=trueのグループはdefaultGroupと一致する", () => {
      const currentGroup = result.groupDataList.find((gd) => gd.group.isCurrent);
      const matchesDefaultGroup =
        result.defaultGroup === null || currentGroup?.group.id === result.defaultGroup.id;

      expect(matchesDefaultGroup).toBe(true);
    });
  });

  describe("グループごとのアカウント数", () => {
    test("「グループ選択なし」は全アカウントを含む", () => {
      const noGroupData = result.groupDataList.find((gd) => isNoGroup(gd.group.id));
      const globalAccountCount = result.globalData.registeredAccounts.accounts.length;

      expect(noGroupData?.registeredAccounts.accounts.length).toBe(globalAccountCount);
    });

    test("各グループのアカウント数は「グループ選択なし」以下である", () => {
      const noGroupData = result.groupDataList.find((gd) => isNoGroup(gd.group.id));
      const maxAccounts = noGroupData?.registeredAccounts.accounts.length ?? 0;

      for (const groupData of result.groupDataList) {
        expect(groupData.registeredAccounts.accounts.length).toBeLessThanOrEqual(maxAccounts);
      }
    });
  });
});
