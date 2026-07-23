import { writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  acquireCrawlerRunLock,
  CrawlerAlreadyRunningError,
  getCrawlerRunState,
  runWithCrawlerRunLock,
} from "./crawler-run-lock.js";
import { readCrawlerRunState, writeCrawlerRunState } from "./crawler-run-state.js";

let tempDir: string;
let lockPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "mf-dashboard-crawler-lock-"));
  lockPath = path.join(tempDir, "crawler-run.lock");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("crawler run lock", () => {
  test("releases the lock when progress reporter initialization fails", async () => {
    await expect(
      runWithCrawlerRunLock("manual", async () => undefined, {
        lockPath,
        statePath: tempDir,
      }),
    ).rejects.toThrow(/EISDIR|directory/);

    const lock = await acquireCrawlerRunLock("manual", { lockPath });
    await lock.release();
  });

  test("marks an orphaned running state as failed when no lock exists", async () => {
    const statePath = `${lockPath}.state`;
    await writeCrawlerRunState(
      {
        version: 1,
        runId: "run-a",
        source: "scheduled",
        startedAt: "2026-07-01T00:00:00.000Z",
        finishedAt: null,
        runStatus: "running",
        current: null,
        waitingFor: "処理の完了を待機",
        progress: null,
        reason: null,
        timeline: [],
      },
      { statePath },
    );

    await expect(getCrawlerRunState({ lockPath })).resolves.toMatchObject({
      running: false,
      runStatus: "failed",
      finishedAt: expect.any(String),
      reason: {
        code: "unknown_error",
        message: "前回の実行は完了を確認できませんでした",
      },
    });
    await expect(readCrawlerRunState({ statePath })).resolves.toMatchObject({
      runStatus: "failed",
      finishedAt: expect.any(String),
    });
  });

  test("preserves a run that finishes while checking an absent lock", async () => {
    const statePath = `${lockPath}.state`;
    const runningState = {
      version: 1 as const,
      runId: "run-a",
      source: "scheduled",
      startedAt: "2026-07-01T00:00:00.000Z",
      finishedAt: null,
      runStatus: "running" as const,
      current: null,
      waitingFor: "処理の完了を待機",
      progress: null,
      reason: null,
      timeline: [],
    };
    await writeCrawlerRunState(runningState, { statePath });

    const finishedState = {
      ...runningState,
      finishedAt: "2026-07-01T00:01:00.000Z",
      runStatus: "success" as const,
      waitingFor: null,
      progress: { completed: 0, total: 0 },
    };
    const state = await getCrawlerRunState({
      afterLockMutationGuardAcquired: async () => {
        await writeCrawlerRunState(finishedState, { statePath });
      },
      lockPath,
      statePath,
    });

    expect(state).toEqual({ ...finishedState, running: false, pid: null });
    await expect(readCrawlerRunState({ statePath })).resolves.toEqual(finishedState);
  });

  test("does not finalize a new run while reconciling an absent lock", async () => {
    const statePath = `${lockPath}.state`;
    await writeCrawlerRunState(
      {
        version: 1,
        runId: "orphaned-run",
        source: "scheduled",
        startedAt: "2026-07-01T00:00:00.000Z",
        finishedAt: null,
        runStatus: "running",
        current: null,
        waitingFor: null,
        progress: null,
        reason: null,
        timeline: [],
      },
      { statePath },
    );

    let newRunPromise!: ReturnType<typeof runWithCrawlerRunLock>;
    let newRunSettled = false;
    const state = await getCrawlerRunState({
      afterLockMutationGuardAcquired: async () => {
        newRunPromise = runWithCrawlerRunLock("manual", async () => undefined, {
          lockPath,
          statePath,
        });
        void newRunPromise.finally(() => {
          newRunSettled = true;
        });
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(newRunSettled).toBe(false);
      },
      lockPath,
      statePath,
    });

    expect(state).toMatchObject({ runId: "orphaned-run", runStatus: "failed" });
    await newRunPromise;
    await expect(readCrawlerRunState({ statePath })).resolves.toMatchObject({
      runStatus: "success",
    });
  });

  test("returns idle state when no lock exists", async () => {
    await expect(getCrawlerRunState({ lockPath })).resolves.toEqual({
      running: false,
      pid: null,
      source: null,
      startedAt: null,
    });
  });

  test("returns idle state when the lock directory does not exist", async () => {
    const missingDirectoryLockPath = path.join(tempDir, "missing", "crawler-run.lock");

    await expect(getCrawlerRunState({ lockPath: missingDirectoryLockPath })).resolves.toEqual({
      running: false,
      pid: null,
      source: null,
      startedAt: null,
    });
  });

  test("allows acquisition to wait for an idle status check", async () => {
    let markStatusGuardAcquired: () => void;
    const statusGuardAcquired = new Promise<void>((resolve) => {
      markStatusGuardAcquired = resolve;
    });
    let finishStatusCheck!: () => void;
    const statusMayFinish = new Promise<void>((resolve) => {
      finishStatusCheck = resolve;
    });
    const statePromise = getCrawlerRunState({
      afterLockMutationGuardAcquired: async () => {
        markStatusGuardAcquired();
        await statusMayFinish;
      },
      lockPath,
    });
    await statusGuardAcquired;

    let markAcquisitionBlocked: () => void;
    const acquisitionBlocked = new Promise<void>((resolve) => {
      markAcquisitionBlocked = resolve;
    });
    const lockPromise = acquireCrawlerRunLock("manual", {
      afterLockMutationGuardBlocked: async () => markAcquisitionBlocked(),
      lockPath,
    });
    await acquisitionBlocked;
    finishStatusCheck();

    await expect(statePromise).resolves.toEqual({
      running: false,
      pid: null,
      source: null,
      startedAt: null,
    });
    const lock = await lockPromise;
    expect(lock.record.source).toBe("manual");
    await lock.release();
  });

  test("acquires when a mutation guard was left without a lock", async () => {
    await writeFile(`${lockPath}.mutation`, "");
    await writeFile(
      `${lockPath}.mutation-active-stale-owner`,
      JSON.stringify({ pid: 999_999, pidStartedAt: null }),
    );
    await writeFile(
      `${lockPath}.mutation-owner-reused-pid`,
      JSON.stringify({
        createdAt: new Date(Date.now() - 120_000).toISOString(),
        pid: process.pid,
        pidStartedAt: null,
      }),
    );

    const lock = await acquireCrawlerRunLock("manual", {
      lockPath,
      pidExists: (pid) => pid === process.pid,
    });

    expect(lock.record.source).toBe("manual");
    await lock.release();
  });

  test("reports running state while a lock is held and idle after release", async () => {
    const lock = await acquireCrawlerRunLock("manual", { lockPath });

    const state = await getCrawlerRunState({ lockPath });
    expect(state.running).toBe(true);
    expect(state.pid).toBe(process.pid);
    expect(state.source).toBe("manual");
    expect(state.startedAt).toBe(lock.record.startedAt);

    await lock.release();

    await expect(getCrawlerRunState({ lockPath })).resolves.toEqual({
      running: false,
      pid: null,
      source: null,
      startedAt: null,
    });
  });

  test("rejects a second lock while the first run is active", async () => {
    const lock = await acquireCrawlerRunLock("manual", { lockPath });

    await expect(acquireCrawlerRunLock("scheduled", { lockPath })).rejects.toBeInstanceOf(
      CrawlerAlreadyRunningError,
    );

    await lock.release();
  });

  test("allows exactly one of two simultaneous acquisitions", async () => {
    let publishedCount = 0;
    let releasePublished: () => void;
    const bothPublished = new Promise<void>((resolve) => {
      releasePublished = resolve;
    });
    const options = {
      afterLockMutationIntentPublished: async () => {
        publishedCount += 1;
        if (publishedCount === 2) {
          releasePublished();
        }
        await bothPublished;
      },
      lockPath,
    };
    const results = await Promise.allSettled([
      acquireCrawlerRunLock("manual", options),
      acquireCrawlerRunLock("scheduled", options),
    ]);
    const acquired = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(acquired).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(CrawlerAlreadyRunningError);

    await acquired[0]?.value.release();
  });

  test("clears a stale lock when its process is gone", async () => {
    await writeFile(
      lockPath,
      JSON.stringify({
        id: "stale-lock",
        pid: 999_999,
        source: "scheduled",
        startedAt: new Date().toISOString(),
      }),
    );

    await expect(getCrawlerRunState({ lockPath, pidExists: () => false })).resolves.toEqual({
      running: false,
      pid: null,
      source: null,
      startedAt: null,
    });

    const lock = await acquireCrawlerRunLock("manual", { lockPath });
    expect(lock.record.source).toBe("manual");
    await lock.release();
  });

  test("clears a stale lock even when its recorded process still exists", async () => {
    await writeFile(
      lockPath,
      JSON.stringify({
        id: "stale-lock",
        pid: process.pid,
        source: "manual",
        startedAt: new Date(Date.now() - 2_000).toISOString(),
      }),
    );

    await expect(
      getCrawlerRunState({ lockPath, pidExists: () => true, staleMs: 1_000 }),
    ).resolves.toEqual({
      running: false,
      pid: null,
      source: null,
      startedAt: null,
    });

    const lock = await acquireCrawlerRunLock("scheduled", { lockPath });
    expect(lock.record.source).toBe("scheduled");
    await lock.release();
  });

  test("clears a lock when the recorded PID was reused by a restarted process", async () => {
    await writeFile(
      lockPath,
      JSON.stringify({
        id: "stale-lock",
        pid: process.pid,
        pidStartedAt: "old-process-start",
        source: "manual",
        startedAt: new Date().toISOString(),
      }),
    );

    await expect(
      getCrawlerRunState({
        getPidStartedAt: () => "new-process-start",
        lockPath,
        pidExists: () => true,
        staleMs: 24 * 60 * 60 * 1000,
      }),
    ).resolves.toEqual({
      running: false,
      pid: null,
      source: null,
      startedAt: null,
    });

    const lock = await acquireCrawlerRunLock("scheduled", { lockPath });
    expect(lock.record.source).toBe("scheduled");
    await lock.release();
  });

  test("does not remove a replacement lock when stale cleanup races", async () => {
    await writeFile(
      lockPath,
      JSON.stringify({
        id: "stale-lock",
        pid: 123,
        source: "manual",
        startedAt: new Date(Date.now() - 120_000).toISOString(),
      }),
    );

    const replacement = {
      id: "replacement-lock",
      pid: process.pid,
      pidStartedAt: "current-process-start",
      source: "scheduled",
      startedAt: new Date().toISOString(),
    };
    let replaced = false;

    const state = await getCrawlerRunState({
      getPidStartedAt: () => "current-process-start",
      lockPath,
      pidExists: () => {
        if (!replaced) {
          writeFileSync(lockPath, JSON.stringify(replacement));
          replaced = true;
        }
        return true;
      },
      staleMs: 60_000,
    });

    expect(state).toEqual({
      running: true,
      pid: process.pid,
      source: "scheduled",
      startedAt: replacement.startedAt,
    });
  });

  test("preserves a replacement installed after the final stale check", async () => {
    await writeFile(
      lockPath,
      JSON.stringify({
        id: "stale-lock",
        pid: 123,
        source: "manual",
        startedAt: new Date(Date.now() - 120_000).toISOString(),
      }),
    );

    const replacement = {
      id: "replacement-lock",
      pid: process.pid,
      source: "scheduled",
      startedAt: new Date().toISOString(),
    };

    const state = await getCrawlerRunState({
      beforeStaleLockRemoval: async () => {
        await rm(lockPath);
        await writeFile(lockPath, JSON.stringify(replacement));
      },
      lockPath,
      pidExists: (pid) => pid === process.pid,
    });

    expect(state).toEqual({
      running: true,
      pid: process.pid,
      source: "scheduled",
      startedAt: replacement.startedAt,
    });
    await expect(readFile(lockPath, "utf8")).resolves.toBe(JSON.stringify(replacement));
    await expect(acquireCrawlerRunLock("manual", { lockPath })).rejects.toBeInstanceOf(
      CrawlerAlreadyRunningError,
    );
  });

  test("rejects acquisition while a raced replacement is quarantined", async () => {
    await writeFile(
      lockPath,
      JSON.stringify({
        id: "stale-lock",
        pid: 123,
        source: "manual",
        startedAt: new Date(Date.now() - 120_000).toISOString(),
      }),
    );

    const replacement = {
      id: "replacement-lock",
      pid: process.pid,
      source: "scheduled",
      startedAt: new Date().toISOString(),
    };
    let intrusion!: ReturnType<typeof acquireCrawlerRunLock>;
    let intrusionSettled = false;

    const state = await getCrawlerRunState({
      afterStaleLockQuarantine: async () => {
        intrusion = acquireCrawlerRunLock("intruder", { lockPath });
        void intrusion.then(
          () => {
            intrusionSettled = true;
          },
          () => {
            intrusionSettled = true;
          },
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(intrusionSettled).toBe(false);
      },
      beforeStaleLockRemoval: async () => {
        await rm(lockPath);
        await writeFile(lockPath, JSON.stringify(replacement));
      },
      lockPath,
      pidExists: (pid) => pid === process.pid,
    });
    await expect(intrusion).rejects.toBeInstanceOf(CrawlerAlreadyRunningError);

    expect(state).toEqual({
      running: true,
      pid: process.pid,
      source: "scheduled",
      startedAt: replacement.startedAt,
    });
    await expect(readFile(lockPath, "utf8")).resolves.toBe(JSON.stringify(replacement));
  });

  test("releases a replacement that finishes while quarantined", async () => {
    await writeFile(
      lockPath,
      JSON.stringify({
        id: "stale-lock",
        pid: 999_999,
        source: "scheduled",
        startedAt: new Date().toISOString(),
      }),
    );
    let replacementLock!: Awaited<ReturnType<typeof acquireCrawlerRunLock>>;
    let releasePromise!: Promise<void>;
    let releaseSettled = false;

    await getCrawlerRunState({
      afterStaleLockQuarantine: async () => {
        releasePromise = replacementLock.release();
        void releasePromise.then(
          () => {
            releaseSettled = true;
          },
          () => undefined,
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(releaseSettled).toBe(false);
      },
      beforeStaleLockCleanup: async () => {
        await rm(lockPath);
        replacementLock = await acquireCrawlerRunLock("replacement", { lockPath });
      },
      lockPath,
      pidExists: (pid) => pid === process.pid,
    });
    await releasePromise;

    await expect(getCrawlerRunState({ lockPath })).resolves.toEqual({
      running: false,
      pid: null,
      source: null,
      startedAt: null,
    });
  });

  test("recovers a replacement left quarantined by interrupted cleanup", async () => {
    await writeFile(
      lockPath,
      JSON.stringify({
        id: "stale-lock",
        pid: 123,
        source: "manual",
        startedAt: new Date(Date.now() - 120_000).toISOString(),
      }),
    );

    const replacement = {
      id: "replacement-lock",
      pid: process.pid,
      source: "scheduled",
      startedAt: new Date().toISOString(),
    };

    await expect(
      getCrawlerRunState({
        afterStaleLockQuarantine: async () => {
          throw new Error("interrupted cleanup");
        },
        beforeStaleLockRemoval: async () => {
          await rm(lockPath);
          await writeFile(lockPath, JSON.stringify(replacement));
        },
        lockPath,
        pidExists: (pid) => pid === process.pid,
      }),
    ).rejects.toThrow("interrupted cleanup");

    await expect(
      getCrawlerRunState({ lockPath, pidExists: (pid) => pid === process.pid }),
    ).resolves.toEqual({
      running: true,
      pid: process.pid,
      source: "scheduled",
      startedAt: replacement.startedAt,
    });
    await expect(acquireCrawlerRunLock("manual", { lockPath })).rejects.toBeInstanceOf(
      CrawlerAlreadyRunningError,
    );
    await expect(readFile(lockPath, "utf8")).resolves.toBe(JSON.stringify(replacement));
  });

  test("clears a stale lock left quarantined by interrupted cleanup", async () => {
    await writeFile(
      lockPath,
      JSON.stringify({
        id: "stale-lock",
        pid: 999_999,
        source: "scheduled",
        startedAt: new Date().toISOString(),
      }),
    );

    await expect(
      getCrawlerRunState({
        afterStaleLockQuarantine: async () => {
          throw new Error("interrupted cleanup");
        },
        lockPath,
        pidExists: () => false,
      }),
    ).rejects.toThrow("interrupted cleanup");

    await expect(getCrawlerRunState({ lockPath, pidExists: () => false })).resolves.toEqual({
      running: false,
      pid: null,
      source: null,
      startedAt: null,
    });
  });

  test("allows acquisition to wait for status to remove a stale lock", async () => {
    await writeFile(
      lockPath,
      JSON.stringify({
        id: "stale-lock",
        pid: 999_999,
        source: "scheduled",
        startedAt: new Date().toISOString(),
      }),
    );
    let markCleanupGuardAcquired: () => void;
    const cleanupGuardAcquired = new Promise<void>((resolve) => {
      markCleanupGuardAcquired = resolve;
    });
    let finishCleanup!: () => void;
    const cleanupMayFinish = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    const statePromise = getCrawlerRunState({
      afterLockMutationGuardAcquired: async () => {
        markCleanupGuardAcquired();
        await cleanupMayFinish;
      },
      lockPath,
      pidExists: () => false,
    });
    await cleanupGuardAcquired;

    let markAcquisitionBlocked: () => void;
    const acquisitionBlocked = new Promise<void>((resolve) => {
      markAcquisitionBlocked = resolve;
    });
    const lockPromise = acquireCrawlerRunLock("manual", {
      afterLockMutationGuardBlocked: async () => markAcquisitionBlocked(),
      lockPath,
      pidExists: () => false,
    });
    await acquisitionBlocked;
    finishCleanup();

    await expect(statePromise).resolves.toEqual({
      running: false,
      pid: null,
      source: null,
      startedAt: null,
    });
    const lock = await lockPromise;
    expect(lock.record.source).toBe("manual");
    await lock.release();
  });

  test("treats a fresh invalid lock as running", async () => {
    await writeFile(lockPath, "");

    const state = await getCrawlerRunState({ lockPath });
    expect(state.running).toBe(true);
    expect(state.pid).toBeNull();
    expect(state.source).toBeNull();
    expect(state.startedAt).not.toBeNull();

    await expect(acquireCrawlerRunLock("manual", { lockPath })).rejects.toBeInstanceOf(
      CrawlerAlreadyRunningError,
    );
  });
});
