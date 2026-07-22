import { CrawlerAlreadyRunningError, runWithCrawlerRunLock } from "./crawler-run-lock.js";
import { error, warn } from "./logger.js";
import { runCrawler } from "./run.js";

async function main() {
  try {
    await runWithCrawlerRunLock(process.env.CRAWLER_RUN_SOURCE ?? "cli", runCrawler);
  } catch (err) {
    if (err instanceof CrawlerAlreadyRunningError) {
      warn("Crawler is already running; skipped this run");
      return;
    }

    error("Crawler failed:", err);
    process.exitCode = 1;
  }
}

void main();
