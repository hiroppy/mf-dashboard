import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  CRAWLER_STEPS,
  createCrawlerProgressReporter,
  normalizeCrawlerError,
  runCrawlerStep,
} from "./crawler-progress.js";
import { getCrawlerRunState, runWithCrawlerRunLock } from "./crawler-run-lock.js";
import { info, warn } from "./logger.js";

describe("crawler progress", () => {
  test("diagnostic sink failures preserve the original error and persist the failed step", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "crawler-diagnostic-sink-failure-"));
    const statePath = path.join(directory, "state.json");
    // An existing directory makes file persistence fail deterministically.
    vi.stubEnv("CRAWLER_DIAGNOSTIC_PATH", directory);
    const output = vi.mocked(info).mockImplementation(() => {
      throw new Error("synthetic-stdout-failure");
    });
    const warning = vi.mocked(warn).mockImplementation(() => {
      throw new Error("synthetic-warning-failure");
    });
    const failure = Object.assign(new Error("Timeout 10000ms exceeded"), { name: "TimeoutError" });
    try {
      const progress = await createCrawlerProgressReporter(statePath, {
        id: "run-a",
        source: "test",
        startedAt: "2026-07-01T00:00:00.000Z",
      });
      await expect(
        runCrawlerStep(progress, CRAWLER_STEPS.registeredAccounts, async () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
      const state = JSON.parse(await readFile(statePath, "utf8"));
      expect(state.timeline).toEqual([
        expect.objectContaining({
          step: "registered_accounts",
          status: "failed",
          reason: expect.objectContaining({ code: "moneyforward_timeout" }),
        }),
      ]);
    } finally {
      output.mockReset();
      warning.mockReset();
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("persists direct refresh progress and warnings without account names or messages", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "crawler-refresh-diagnostics-"));
    const destination = path.join(directory, "run.ndjson");
    vi.stubEnv("CRAWLER_DIAGNOSTIC_PATH", destination);
    try {
      const reporter = await createCrawlerProgressReporter(path.join(directory, "state.json"), {
        id: "run-a",
        source: "test",
        startedAt: new Date().toISOString(),
      });
      const id = await reporter.startStep(CRAWLER_STEPS.refresh, {
        maxWaitMinutes: 20,
        remainingCount: 3,
        incompleteAccounts: ["secret-account"],
      });
      await reporter.updateStep(id, { remainingCount: 1 });
      await reporter.warnStep(id, {
        code: "refresh_timeout",
        message: "secret-message",
        maxWaitMinutes: 20,
        incompleteAccounts: ["secret-account"],
      });
      const content = await readFile(destination, "utf8");
      const records = content
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(records.map((record) => record.event)).toEqual([
        "step_started",
        "step_progress",
        "step_warning",
      ]);
      expect(records[1]).toMatchObject({ step: "moneyforward_refresh", remaining_count: 1 });
      expect(records[2]).toMatchObject({ reason_code: "refresh_timeout", max_wait_minutes: 20 });
      expect(content).not.toContain("secret-account");
      expect(content).not.toContain("secret-message");
    } finally {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("認証中の Playwright timeout を auth_failed に分類する", () => {
    const timeout = new Error("locator.waitFor: Timeout 30000ms exceeded");
    timeout.name = "TimeoutError";

    expect(normalizeCrawlerError(timeout, "auth_failed")).toEqual({
      code: "auth_failed",
      message: "MoneyForward の認証に失敗しました",
    });
  });

  test.each([
    ["database_save", "データベース保存がタイムアウトしました"],
    ["notification_failed", "更新結果の通知がタイムアウトしました"],
    ["web_cache_refresh_failed", "Webキャッシュ更新がタイムアウトしました"],
  ])("MoneyForward外の %s timeout に処理名を残す", (fallbackCode, expectedMessage) => {
    const timeout = new Error("Timeout 5000ms exceeded");
    timeout.name = "TimeoutError";

    expect(normalizeCrawlerError(timeout, fallbackCode)).toEqual({
      code: "unknown_error",
      message: expectedMessage,
    });
  });

  test("Playwright navigation error を安全な reason に分類する", () => {
    expect(
      normalizeCrawlerError(
        new Error("page.goto: net::ERR_ABORTED at https://example.invalid/?token=secret"),
        "global_data_failed",
      ),
    ).toEqual({
      code: "navigation_failed",
      message: "MoneyForward の画面遷移に失敗しました",
      url: "MoneyForward画面",
    });
  });

  test.each([
    [
      "timeout",
      Object.assign(new Error("Timeout 2500ms: secret-value"), { name: "TimeoutError" }),
      "moneyforward_refresh",
      { code: "moneyforward_timeout", timeoutMs: 2_500 },
    ],
    [
      "selector error",
      new Error("locator not found: secret-value"),
      "group_data",
      { code: "selector_not_found" },
    ],
    ["unknown error", new Error("secret-value"), "analytics", { code: "unknown_error" }],
  ])("%s を安全な reason に正規化する", (_case, error, fallbackCode, expected) => {
    const reason = normalizeCrawlerError(error, fallbackCode);

    expect(reason).toEqual(expect.objectContaining(expected));
    expect(JSON.stringify(reason)).not.toContain("secret-value");
  });

  test("nested step 完了後に外側の running step を current に戻す", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "crawler-progress-nested-"));
    try {
      const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
        id: "run-a",
        source: "test",
        startedAt: "2026-07-01T00:00:00.000Z",
      });
      const accountsStep = await progress.startStep(CRAWLER_STEPS.registeredAccounts);
      const refreshStep = await progress.startStep(CRAWLER_STEPS.refresh);

      await progress.completeStep(refreshStep);

      expect(progress.getState().current).toMatchObject({
        timelineItemId: accountsStep,
        step: "registered_accounts",
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("state write 失敗時に未永続 step を in-memory state へ反映しない", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "crawler-progress-write-failure-"));
    const statePath = path.join(tempDir, "state.json");
    try {
      const progress = await createCrawlerProgressReporter(statePath, {
        id: "run-a",
        source: "test",
        startedAt: "2026-07-01T00:00:00.000Z",
      });
      await rm(statePath);
      await mkdir(statePath);

      await expect(progress.startStep(CRAWLER_STEPS.analytics)).rejects.toThrow(/EISDIR|directory/);
      expect(progress.getState().timeline).toEqual([]);

      await rm(statePath, { recursive: true });
      await progress.finish("failed");
      expect(progress.getState().timeline).toEqual([]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("通常終了後も success と finishedAt を latest state に残す", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "crawler-progress-success-"));
    const lockPath = path.join(tempDir, "crawler-run.lock");
    try {
      await runWithCrawlerRunLock(
        "test",
        async (progress) => {
          expect(progress.getState().progress).toEqual({ completed: 0, total: 13 });
          await runCrawlerStep(progress, CRAWLER_STEPS.analytics, async () => {
            expect(progress.getState().progress).toEqual({ completed: 0, total: 13 });
          });
          expect(progress.getState().progress).toEqual({ completed: 1, total: 13 });
        },
        { lockPath },
      );

      const state = await getCrawlerRunState({ lockPath });
      expect(state).toMatchObject({
        running: false,
        runStatus: "success",
        current: null,
      });
      expect(state.finishedAt).toEqual(expect.any(String));
      expect(state.timeline).toEqual([
        expect.objectContaining({ step: "analytics", status: "done" }),
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("並行 step の一つを完了しても別の running step を current に保つ", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "crawler-progress-current-"));
    try {
      const progress = await createCrawlerProgressReporter(path.join(tempDir, "state.json"), {
        id: "run-a",
        source: "test",
        startedAt: "2026-07-01T00:00:00.000Z",
      });
      const firstStep = await progress.startStep(CRAWLER_STEPS.monthlyCashFlow, {
        month: "2026-06",
      });
      await progress.startStep(CRAWLER_STEPS.monthlyCashFlow, { month: "2026-05" });

      await progress.completeStep(firstStep);

      expect(progress.getState().current).toMatchObject({
        step: "cash_flow_history",
        metadata: { kind: "month", month: "2026-05" },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("認証失敗を authentication step と安全な reason に記録する", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "crawler-progress-auth-"));
    const statePath = path.join(tempDir, "crawler.state");
    try {
      const progress = await createCrawlerProgressReporter(statePath, {
        id: "run-a",
        source: "test",
        startedAt: "2026-07-01T00:00:00.000Z",
      });

      await expect(
        runCrawlerStep(
          progress,
          CRAWLER_STEPS.authentication,
          async () => {
            throw new Error("credentials: secret-value");
          },
          { failureCode: "auth_failed" },
        ),
      ).rejects.toThrow("credentials: secret-value");
      await progress.finish("failed", progress.getState().reason ?? undefined);

      expect(progress.getState()).toMatchObject({
        runStatus: "failed",
        finishedAt: expect.any(String),
        current: expect.objectContaining({ step: "authentication" }),
        reason: {
          code: "auth_failed",
          message: "MoneyForward の認証に失敗しました",
        },
        timeline: [
          expect.objectContaining({
            step: "authentication",
            status: "failed",
            reason: {
              code: "auth_failed",
              message: "MoneyForward の認証に失敗しました",
            },
          }),
        ],
      });
      expect(JSON.stringify(progress.getState())).not.toContain("secret-value");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
