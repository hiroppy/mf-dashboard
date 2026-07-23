import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  getCrawlerRunStatePath,
  readCrawlerRunState,
  type CrawlerRunReason,
  type CrawlerRunStateSnapshot,
  writeCrawlerRunState,
} from "./crawler-run-state.js";

const startedAt = "2026-01-01T00:00:00.000Z";
const finishedAt = "2026-01-01T00:01:00.000Z";

const runningState: CrawlerRunStateSnapshot = {
  version: 1,
  runId: "run-running",
  runStatus: "running",
  source: "manual",
  startedAt,
  finishedAt: null,
  current: {
    timelineItemId: "refresh",
    step: "moneyforward_refresh",
    label: "金融機関を更新",
    metadata: {
      kind: "refresh",
      maxWaitMinutes: 0.5,
      remainingAccounts: 1,
      incompleteAccounts: ["Institution A"],
    },
  },
  waitingFor: "更新中の金融機関が0件になるのを待機",
  progress: { completed: 1, total: 3 },
  timeline: [
    {
      id: "refresh",
      step: "moneyforward_refresh",
      label: "金融機関を更新",
      status: "running",
      startedAt,
      finishedAt: null,
      reason: null,
      metadata: {
        kind: "refresh",
        maxWaitMinutes: 0.5,
        remainingAccounts: 1,
        incompleteAccounts: ["Institution A"],
      },
    },
  ],
  reason: null,
};

const successState: CrawlerRunStateSnapshot = {
  ...runningState,
  runId: "run-success",
  runStatus: "success",
  finishedAt,
  current: null,
  waitingFor: null,
  progress: { completed: 3, total: 3 },
  timeline: [
    {
      ...runningState.timeline[0],
      status: "done",
      startedAt,
      finishedAt,
      reason: null,
    },
  ],
};

const failedState: CrawlerRunStateSnapshot = {
  ...runningState,
  runId: "run-failed",
  runStatus: "failed",
  finishedAt,
  waitingFor: null,
  timeline: [
    {
      id: "group-a",
      step: "group_data",
      label: "グループを取得",
      status: "failed",
      startedAt,
      finishedAt,
      reason: {
        code: "selector_not_found",
        message: "必要な項目が見つかりませんでした",
        selector: "[data-test=group]",
      },
      metadata: { kind: "group", groupName: "Group A" },
    },
  ],
  reason: {
    code: "selector_not_found",
    message: "必要な項目が見つかりませんでした",
    selector: "[data-test=group]",
  },
};

const reasons = [
  { code: "auth_failed", message: "認証に失敗しました" },
  {
    code: "refresh_timeout",
    message: "更新がタイムアウトしました",
    maxWaitMinutes: 20,
    incompleteAccounts: ["Institution A"],
  },
  {
    code: "moneyforward_timeout",
    message: "応答がタイムアウトしました",
    operation: "MoneyForward画面の応答待ち",
    timeoutMs: 30_000,
  },
  {
    code: "navigation_failed",
    message: "画面遷移に失敗しました",
    url: "MoneyForward画面",
  },
  {
    code: "selector_not_found",
    message: "必要な項目が見つかりませんでした",
    selector: "MoneyForward画面の操作対象",
  },
  { code: "unknown_error", message: "処理中にエラーが発生しました" },
] satisfies CrawlerRunReason[];

describe("crawler run state file", () => {
  let directory: string;
  let statePath: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "crawler-run-state-"));
    statePath = path.join(directory, "nested", "crawler-run-state.json");
    await mkdir(path.dirname(statePath), { recursive: true });
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test("uses data/crawler-run-state.json by default", () => {
    expect(getCrawlerRunStatePath()).toBe(
      path.resolve(import.meta.dirname, "../../../data/crawler-run-state.json"),
    );
  });

  test.each([
    ["running", runningState],
    ["success", successState],
    ["failed", failedState],
  ])("atomically writes and reads a %s snapshot", async (_status, state) => {
    await writeCrawlerRunState(state, { statePath });

    await expect(readCrawlerRunState({ statePath })).resolves.toEqual(state);
    await expect(readdir(path.dirname(statePath))).resolves.toEqual(["crawler-run-state.json"]);
    await expect(readFile(statePath, "utf8")).resolves.toBe(`${JSON.stringify(state, null, 2)}\n`);
  });

  test.each(reasons)("persists the $code reason union variant", async (reason) => {
    const failedItem = failedState.timeline[0];
    if (!failedItem || failedItem.status !== "failed") {
      throw new Error("failed state fixture must contain a failed timeline item");
    }
    const state: CrawlerRunStateSnapshot = {
      ...failedState,
      reason,
      timeline: [{ ...failedItem, reason }],
    };

    await writeCrawlerRunState(state, { statePath });

    await expect(readCrawlerRunState({ statePath })).resolves.toEqual(state);
  });

  test("returns null when the state file does not exist", async () => {
    await expect(readCrawlerRunState({ statePath })).resolves.toBeNull();
  });

  test("returns null for invalid JSON", async () => {
    await writeFile(statePath, "{ invalid json");

    await expect(readCrawlerRunState({ statePath })).resolves.toBeNull();
  });

  test("returns null for JSON with an invalid state shape", async () => {
    await writeCrawlerRunState(runningState, { statePath });
    await writeFile(statePath, JSON.stringify({ ...runningState, runStatus: "idle" }));

    await expect(readCrawlerRunState({ statePath })).resolves.toBeNull();
  });
});
