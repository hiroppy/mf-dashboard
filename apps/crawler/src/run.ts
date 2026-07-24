import { closeDb } from "@mf-dashboard/db";
import { buildCleanupGroupIds } from "./cleanup-groups.js";
import {
  handleCrawlerFailure,
  runAnalyticsPhase,
  runAuthPhase,
  runCashFlowHistoryPhase,
  runInstitutionCategoryPhase,
  runLoadPhase,
  runNotificationPhase,
  runSavePhase,
  runScrapePhase,
  runSetupPhase,
  type CrawlerRuntime,
} from "./crawler-phases.js";
import {
  CRAWLER_STEPS,
  normalizeCrawlerError,
  runCrawlerStep,
  type CrawlerProgressReporter,
} from "./crawler-progress.js";
import { error, info, warn } from "./logger.js";
import { createGroupScope } from "./scrapers/group.js";
import { notifyWebRefresh } from "./web-refresh.js";

export async function runCrawler(progress: CrawlerProgressReporter): Promise<void> {
  const config = runLoadPhase();
  let runtime: CrawlerRuntime | null = null;

  try {
    const activeRuntime = await runSetupPhase(config);
    runtime = activeRuntime;
    await runCrawlerStep(
      progress,
      CRAWLER_STEPS.authentication,
      () => runAuthPhase(activeRuntime.page, activeRuntime.context),
      { failureCode: "auth_failed" },
    );

    await using groupScope = await createGroupScope(activeRuntime.page);
    const scrapeResult = await runScrapePhase(activeRuntime.page, config, progress);
    const cleanupResult = config.cleanupGroups
      ? buildCleanupGroupIds(scrapeResult.groupDataList)
      : null;
    if (config.cleanupGroups && !cleanupResult) {
      warn(
        "Skipped group cleanup because no groups were scraped; group selector retrieval may have failed.",
      );
    }
    await runCrawlerStep(progress, CRAWLER_STEPS.databaseSave, () =>
      runCashFlowHistoryPhase(
        activeRuntime.db,
        activeRuntime.page,
        config,
        activeRuntime.categoryDecision,
        progress,
        async (historyMonths) => {
          const savedCounts = await runSavePhase(
            activeRuntime.db,
            activeRuntime.page,
            scrapeResult,
            activeRuntime.categoryDecision,
            historyMonths,
            cleanupResult?.ids,
          );
          if (cleanupResult) info("Cleaned up groups not found in MoneyForward");
          return savedCounts;
        },
      ),
    );
    await runCrawlerStep(progress, CRAWLER_STEPS.institutionCategories, () =>
      runInstitutionCategoryPhase(activeRuntime.db, activeRuntime.page),
    );
    await runCrawlerStep(progress, CRAWLER_STEPS.analytics, () =>
      runAnalyticsPhase(activeRuntime.db, scrapeResult.groupDataList),
    );
    const notificationStep = await progress.startStep(CRAWLER_STEPS.notification);
    const notificationFailure = await runNotificationPhase(
      scrapeResult.groupDataList,
      groupScope.originalGroup,
    );
    if (notificationFailure) {
      await progress.warnStep(
        notificationStep,
        normalizeCrawlerError(notificationFailure, "notification_failed"),
      );
    } else {
      await progress.completeStep(notificationStep);
    }

    const webRefreshStep = await progress.startStep(CRAWLER_STEPS.webCacheRefresh);
    try {
      await notifyWebRefresh();
      await progress.completeStep(webRefreshStep);
    } catch (err) {
      await progress.warnStep(
        webRefreshStep,
        normalizeCrawlerError(err, "web_cache_refresh_failed"),
      );
      error("Failed to refresh web cache:", err);
    }

    info("Completed!");
  } catch (err) {
    await handleCrawlerFailure(err, runtime?.page, config);
    throw err;
  } finally {
    try {
      if (runtime) {
        await runtime.browser.close();
      }
    } finally {
      closeDb();
    }
  }
}
