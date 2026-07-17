import { writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  acquireCrawlerRunLock,
  CrawlerAlreadyRunningError,
  getCrawlerRunState,
} from "./crawler-run-lock.js";

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

  test("does not block acquisition during an idle status check", async () => {
    let markStatusCheckingQuarantine: () => void;
    const statusCheckingQuarantine = new Promise<void>((resolve) => {
      markStatusCheckingQuarantine = resolve;
    });
    let finishStatusCheck!: () => void;
    const statusMayFinish = new Promise<void>((resolve) => {
      finishStatusCheck = resolve;
    });
    const statePromise = getCrawlerRunState({
      beforeQuarantinedLockCheck: async () => {
        markStatusCheckingQuarantine();
        await statusMayFinish;
      },
      lockPath,
    });
    await statusCheckingQuarantine;

    const lock = await acquireCrawlerRunLock("manual", { lockPath });
    await lock.release();
    finishStatusCheck();

    await expect(statePromise).resolves.toEqual({
      running: false,
      pid: null,
      source: null,
      startedAt: null,
    });
    expect(lock.record.source).toBe("manual");
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

    const state = await getCrawlerRunState({
      afterStaleLockQuarantine: async () => {
        await expect(acquireCrawlerRunLock("intruder", { lockPath })).rejects.toBeInstanceOf(
          CrawlerAlreadyRunningError,
        );
      },
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
