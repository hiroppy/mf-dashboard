import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { analyzeFinancialData } from "@mf-dashboard/analytics";
import { initDb, type Db } from "@mf-dashboard/db";
import { buildAccountIdMap } from "@mf-dashboard/db/repository/accounts";
import { saveScrapedDataBatch } from "@mf-dashboard/db/repository/save-scraped-data";
import {
  hasTransactionsForMonth,
  saveTransactionsForMonths,
} from "@mf-dashboard/db/repository/transactions";
import type { CashFlowItem } from "@mf-dashboard/db/types";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { loginWithAuthState } from "./auth/login.js";
import { hasAuthState } from "./auth/state.js";
import { createBrowserContext } from "./browser/context.js";
import { categorizeCashFlowMonth } from "./category-decision/categorize-cash-flow.js";
import { loadCategoryDecisionConfig } from "./category-decision/config.js";
import type {
  CategoryDecisionUsage,
  NormalizedCategoryDecisionConfig,
} from "./category-decision/types.js";
import {
  CRAWLER_STEPS,
  normalizeCrawlerError,
  type CrawlerProgressReporter,
} from "./crawler-progress.js";
import { buildScrapedData, buildGroupOnlyScrapedData } from "./data-builder.js";
import { getHistoryMaxMonths, getHistoryMonth } from "./history-months.js";
import { runHooks } from "./hooks/runner.js";
import { debug, error, info, log, phase, warn } from "./logger.js";
import { sendFailureNotifications, sendSuccessNotifications } from "./notification.js";
import { scrapeAllGroups, type GroupData, type ScrapeResult } from "./scraper.js";
import { scrapeCashFlowHistory } from "./scrapers/cash-flow-history.js";
import { isNoGroup, switchGroup, NO_GROUP_ID } from "./scrapers/group.js";
import { scrapeInstitutionCategories } from "./scrapers/institution-categories.js";

const DEFAULT_ENV_PATH = path.resolve(import.meta.dirname, "../../../.env");
const DEFAULT_DB_PATH = path.join(import.meta.dirname, "../../../data/moneyforward.db");
const DEBUG_DIR = path.resolve(import.meta.dirname, "../debug");

export interface CrawlerConfig {
  skipRefresh: boolean;
  cleanupGroups: boolean;
  authState: "configured" | "none";
  dbPath: string;
  dbExists: boolean;
  scrapeMode: string;
  isHistoryMode: boolean;
  isDebug: boolean;
  isHeaded: boolean;
}

export interface CrawlerRuntime {
  db: Db;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  categoryDecision: CategoryDecisionRuntime;
}

export interface CategoryDecisionRuntime {
  config: NormalizedCategoryDecisionConfig | null;
  usage: CategoryDecisionUsage;
}

export function runLoadPhase(): CrawlerConfig {
  phase("Load");
  loadEnvFile();

  const config = loadCrawlerConfig();
  logCrawlerOptions(config);
  return config;
}

function loadEnvFile(envPath = DEFAULT_ENV_PATH): void {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // .env file not found (e.g., CI environment)
  }
}

export function loadCrawlerConfig(
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (filePath: string) => boolean = existsSync,
  authStateExists: () => boolean = hasAuthState,
): CrawlerConfig {
  const skipRefresh = env.SKIP_REFRESH === "true";
  const cleanupGroups = env.CLEANUP_GROUPS === "true";
  const dbPath = env.DB_PATH || DEFAULT_DB_PATH;
  const dbExists = fileExists(dbPath);
  const scrapeMode = env.SCRAPE_MODE || (dbExists ? "month" : "history");

  return {
    skipRefresh,
    cleanupGroups,
    authState: authStateExists() ? "configured" : "none",
    dbPath,
    dbExists,
    scrapeMode,
    isHistoryMode: scrapeMode === "history",
    isDebug: env.DEBUG === "true",
    isHeaded: env.HEADED === "true",
  };
}

function logCrawlerOptions(config: CrawlerConfig): void {
  phase("Options");
  log(`SKIP_REFRESH:   ${config.skipRefresh}`);
  info(`CLEANUP_GROUPS: ${config.cleanupGroups}`);
  log(`SCRAPE_MODE:    ${config.scrapeMode} (DB exists: ${config.dbExists})`);
  log(`DEBUG:          ${config.isDebug}`);
  log(`HEADED:         ${config.isHeaded}`);
  log(`AUTH_STATE:     ${config.authState}`);
}

export async function runSetupPhase(config: CrawlerConfig): Promise<CrawlerRuntime> {
  phase("Setup");
  info("Initializing database");
  const db = await initDb();
  const categoryDecision = await loadCategoryDecisionRuntime();

  let browser: Browser | null = null;
  try {
    log("Launching browser");
    browser = await chromium.launch({
      headless: !config.isHeaded,
    });

    const context = await createBrowserContext(browser, { useAuthState: true });
    const page = await context.newPage();

    return {
      db,
      browser,
      context,
      page,
      categoryDecision,
    };
  } catch (err) {
    if (browser) {
      await browser.close();
    }
    throw err;
  }
}

async function loadCategoryDecisionRuntime(): Promise<CategoryDecisionRuntime> {
  const result = await loadCategoryDecisionConfig(undefined, warn);
  if (result.enabled) {
    info("Category decision: enabled (data/category-rules.json found)");
  } else {
    info("Category decision: disabled (data/category-rules.json not found or invalid)");
  }

  return {
    config: result.config,
    usage: { llmCallsUsed: 0 },
  };
}

export async function runAuthPhase(page: Page, context: BrowserContext): Promise<void> {
  phase("Auth");
  info("Authenticating");
  await loginWithAuthState(page, context);

  info("Running hooks");
  await runHooks(page);
}

export async function runScrapePhase(
  page: Page,
  config: Pick<CrawlerConfig, "skipRefresh">,
  progress: CrawlerProgressReporter,
): Promise<ScrapeResult> {
  phase("Scrape");
  const scrapeResult = await scrapeAllGroups(page, progress, {
    skipRefresh: config.skipRefresh,
  });

  info(`Scraped ${scrapeResult.groupDataList.length} groups`);
  for (const [groupIndex, groupData] of scrapeResult.groupDataList.entries()) {
    log(`  - Group ${groupIndex + 1}${isNoGroup(groupData.group.id) ? " (no group)" : ""}`);
  }

  return scrapeResult;
}

export async function runSavePhase(
  db: Db,
  page: Page,
  scrapeResult: ScrapeResult,
  categoryDecision: CategoryDecisionRuntime = { config: null, usage: { llmCallsUsed: 0 } },
  historyMonths: Array<{ items: CashFlowItem[]; month: string }> = [],
  cleanupGroupIds?: string[],
  institutionCategories?: ReadonlyMap<string, string>,
): Promise<number[]> {
  phase("Save");
  const noGroupData = scrapeResult.groupDataList.find((groupData) => isNoGroup(groupData.group.id));
  let fullData: ReturnType<typeof buildScrapedData> | undefined;

  if (noGroupData) {
    info("Saving full data for no-group view");
    let globalData = scrapeResult.globalData;
    if (categoryDecision.config) {
      await switchGroup(page, NO_GROUP_ID);
      globalData = {
        ...globalData,
        cashFlow: await categorizeCashFlowMonth({
          page,
          db,
          cashFlow: globalData.cashFlow,
          config: categoryDecision.config,
          usage: categoryDecision.usage,
        }),
      };
    }

    fullData = buildScrapedData(globalData, noGroupData);
    debug("Full scraped data prepared");
  } else {
    warn("No no-group data found; skipped full data save");
  }

  const groupOnlyData = scrapeResult.groupDataList.filter(
    (groupData) => !isNoGroup(groupData.group.id),
  );

  const groupOnlyScrapedData = groupOnlyData.map((groupData, groupIndex) => {
    info(`Saving group-only data for group ${groupIndex + 1}`);
    return buildGroupOnlyScrapedData(groupData);
  });

  return saveScrapedDataBatch(db, {
    cleanupGroupIds,
    fullData,
    groupOnlyData: groupOnlyScrapedData,
    historyMonths,
    institutionCategories,
  });
}

export async function runInstitutionCategoryPhase(page: Page): Promise<Map<string, string>> {
  phase("Institution Categories");
  await switchGroup(page, NO_GROUP_ID);
  log("Scraping institution categories");
  const categoryMap = await scrapeInstitutionCategories(page);
  info(`Scraped ${categoryMap.size} account categories`);
  return categoryMap;
}

export async function runCashFlowHistoryPhase(
  db: Db,
  page: Page,
  config: Pick<CrawlerConfig, "isHistoryMode">,
  categoryDecision: CategoryDecisionRuntime = { config: null, usage: { llmCallsUsed: 0 } },
  progress?: CrawlerProgressReporter,
  publishHistory: (
    months: Array<{
      dateRange?: { from: string; to: string };
      items: CashFlowItem[];
      month: string;
    }>,
  ) => Promise<number[]> = async (months) => {
    const accountIdMap = await buildAccountIdMap(db);
    return saveTransactionsForMonths(db, months, accountIdMap);
  },
): Promise<void> {
  phase("Cash Flow History");

  if (!config.isHistoryMode) {
    log("Skipping cash flow history (SCRAPE_MODE is not history)");
    await publishHistory([]);
    return;
  }

  const now = new Date();
  const maxMonths = getHistoryMaxMonths(now);

  let monthsToFetch = 1;
  for (let i = 1; i < maxMonths; i++) {
    const month = getHistoryMonth(now, i);
    if (!(await hasTransactionsForMonth(db, month))) {
      monthsToFetch = i + 1;
    }
  }

  info(`Fetching ${monthsToFetch} months`);

  const monthSteps = new Map<string, string>();
  const setupMonth = getHistoryMonth(now, 0);
  let setupStepId: string | null = null;
  if (progress) {
    setupStepId = await progress.startStep(CRAWLER_STEPS.monthlyCashFlow, { month: setupMonth });
    monthSteps.set(setupMonth, setupStepId);
  }
  async function failRunningMonthSteps(failure: unknown): Promise<void> {
    if (!progress) return;

    const runningStepIds = new Set(
      progress
        .getState()
        .timeline.filter(({ status }) => status === "running")
        .map(({ id }) => id),
    );
    for (const stepId of monthSteps.values()) {
      if (runningStepIds.has(stepId)) {
        await progress.failStep(stepId, normalizeCrawlerError(failure, "monthly_cash_flow_failed"));
      }
    }
  }

  try {
    await switchGroup(page, NO_GROUP_ID);
    const historyResults = await scrapeCashFlowHistory(page, monthsToFetch, {
      onMonthStart: async (month) => {
        if (!progress) return;
        if (monthSteps.has(month)) {
          setupStepId = null;
          return;
        }
        if (setupStepId) {
          monthSteps.delete(setupMonth);
          monthSteps.set(month, setupStepId);
          await progress.updateStep(setupStepId, { month });
          setupStepId = null;
          return;
        }
        monthSteps.set(month, await progress.startStep(CRAWLER_STEPS.monthlyCashFlow, { month }));
      },
      onMonthFailure: async (month, failure) => {
        const stepId = monthSteps.get(month);
        if (progress && stepId) {
          await progress.failStep(
            stepId,
            normalizeCrawlerError(failure, "monthly_cash_flow_failed"),
          );
        }
      },
    });

    const preparedMonths: Array<{
      dateRange?: { from: string; to: string };
      items: CashFlowItem[];
      month: string;
      stepId?: string;
    }> = [];
    for (const { month, progressMonth = month, data: monthData } of historyResults) {
      let stepId = monthSteps.get(progressMonth);
      if (progress && !stepId) {
        stepId = await progress.startStep(CRAWLER_STEPS.monthlyCashFlow, {
          month: progressMonth,
        });
      }
      const categorizedMonthData = categoryDecision.config
        ? await categorizeCashFlowMonth({
            page,
            db,
            cashFlow: monthData,
            config: categoryDecision.config,
            usage: categoryDecision.usage,
          })
        : monthData;
      preparedMonths.push({
        dateRange:
          categorizedMonthData.periodStart && categorizedMonthData.periodEnd
            ? { from: categorizedMonthData.periodStart, to: categorizedMonthData.periodEnd }
            : undefined,
        items: categorizedMonthData.items,
        month,
        stepId,
      });
    }

    const savedCounts = await publishHistory(
      preparedMonths.map(({ dateRange, items, month }) => ({ dateRange, items, month })),
    );
    for (const [index, { month, stepId }] of preparedMonths.entries()) {
      log(`  ${month}: saved ${savedCounts[index] ?? 0} transactions`);
      if (progress && stepId) await progress.completeStep(stepId);
    }
  } catch (failure) {
    await failRunningMonthSteps(failure);
    throw failure;
  }
}

export async function runAnalyticsPhase(db: Db, groupDataList: GroupData[]): Promise<void> {
  phase("Analytics");

  if (groupDataList.length === 0) {
    warn("No group available for analytics");
    return;
  }

  const results = await Promise.all(
    groupDataList.map(async (groupData, groupIndex) => {
      const groupLabel = `group ${groupIndex + 1}`;
      info(`Running financial analysis for ${groupLabel}`);
      const report = await analyzeFinancialData(db, groupData.group.id);
      if (report) {
        info(`Analysis completed and saved for ${groupLabel}`);
      } else {
        log(`No changes detected, skipped analysis for ${groupLabel}`);
      }
      return report;
    }),
  );
  info(`Analytics finished: ${results.filter(Boolean).length}/${groupDataList.length} groups`);
}

export async function runNotificationPhase(
  groupDataList: GroupData[],
  defaultGroup: ScrapeResult["defaultGroup"],
): Promise<Error | null> {
  phase("Notification");

  try {
    await sendSuccessNotifications(groupDataList, defaultGroup);
    return null;
  } catch (err) {
    error("Failed to send notification:", err);
    return err instanceof Error ? err : new Error(String(err));
  }
}

export async function handleCrawlerFailure(
  err: unknown,
  page: Page | undefined,
  config: Pick<CrawlerConfig, "isDebug">,
): Promise<void> {
  error("Error occurred:", err);

  if (config.isDebug && page) {
    try {
      const screenshotPath = await saveDebugScreenshot(page);
      info(`Debug screenshot saved to ${screenshotPath}`);
    } catch (screenshotError) {
      error("Failed to save debug screenshot:", screenshotError);
    }
  }

  const errorForNotification = err instanceof Error ? err : new Error(String(err));
  try {
    await sendFailureNotifications(errorForNotification);
  } catch (notificationError) {
    error("Failed to send error notification:", notificationError);
  }
}

async function saveDebugScreenshot(page: Page, timestamp = Date.now()): Promise<string> {
  const screenshotPath = getDebugScreenshotPath(timestamp);
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

export function getDebugScreenshotPath(timestamp = Date.now(), debugDir = DEBUG_DIR): string {
  return path.join(debugDir, `error-${timestamp}.png`);
}
