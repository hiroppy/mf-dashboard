import { closeDb } from "@mf-dashboard/db";
import {
  handleCrawlerFailure,
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
  type CrawlerRuntime,
} from "./crawler-phases.js";
import { error, info } from "./logger.js";
import { createGroupScope } from "./scrapers/group.js";
import { notifyWebRefresh } from "./web-refresh.js";

export async function runCrawler(): Promise<void> {
  const config = runLoadPhase();
  let runtime: CrawlerRuntime | null = null;

  try {
    runtime = await runSetupPhase(config);
    await runAuthPhase(runtime.page, runtime.context);

    await using groupScope = await createGroupScope(runtime.page);
    const scrapeResult = await runScrapePhase(runtime.page, config);
    await runSavePhase(runtime.db, scrapeResult);
    await runCleanupPhase(runtime.db, scrapeResult.groupDataList, config);
    await runInstitutionCategoryPhase(runtime.db, runtime.page);
    await runCashFlowHistoryPhase(runtime.db, runtime.page, config);
    await runAnalyticsPhase(runtime.db, scrapeResult.groupDataList);
    await runNotificationPhase(scrapeResult.groupDataList, groupScope.originalGroup);

    try {
      await notifyWebRefresh();
    } catch (err) {
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
