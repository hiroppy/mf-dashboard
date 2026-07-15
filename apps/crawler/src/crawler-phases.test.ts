import path from "node:path";
import { describe, expect, test } from "vitest";
import { getDebugScreenshotPath, loadCrawlerConfig } from "./crawler-phases.js";

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
