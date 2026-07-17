import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { link, mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";

const DEFAULT_LOCK_PATH = path.resolve(import.meta.dirname, "../../../data/crawler-run.lock");
const DEFAULT_MAX_WAIT_MINUTES = 20;
const LOCK_STALE_BUFFER_MINUTES = 100;

export interface CrawlerRunState {
  running: boolean;
  pid: number | null;
  source: string | null;
  startedAt: string | null;
}

interface CrawlerRunLockRecord {
  id: string;
  pid: number;
  pidStartedAt: string | null;
  source: string;
  startedAt: string;
}

interface CrawlerRunLockOptions {
  afterStaleLockQuarantine?: () => Promise<void>;
  beforeStaleLockRemoval?: () => Promise<void>;
  lockPath?: string;
  getPidStartedAt?: (pid: number) => string | null;
  pidExists?: (pid: number) => boolean;
  staleMs?: number;
}

export class CrawlerAlreadyRunningError extends Error {
  constructor(readonly state: CrawlerRunState) {
    super("Crawler is already running");
    this.name = "CrawlerAlreadyRunningError";
  }
}

interface CrawlerRunLock {
  record: CrawlerRunLockRecord;
  release: () => Promise<void>;
}

interface LockFileSnapshot {
  contents: string;
  device: number;
  inode: number;
  mtimeMs: number;
  record: CrawlerRunLockRecord | null;
}

interface LockMutationGuard {
  release: () => Promise<void>;
}

type StaleLockRemovalResult = "busy" | "changed" | "removed";

function defaultPidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function getDefaultStaleMs(): number {
  const maxWaitMinutes = Number(process.env.MAX_WAIT_MINUTES) || DEFAULT_MAX_WAIT_MINUTES;
  return (maxWaitMinutes + LOCK_STALE_BUFFER_MINUTES) * 60 * 1000;
}

function getLinuxPidStartedAt(pid: number): string | null {
  try {
    const statContent = readFileSync(`/proc/${pid}/stat`, "utf8");
    const processNameEnd = statContent.lastIndexOf(")");
    if (processNameEnd === -1) {
      return null;
    }

    const fields = statContent
      .slice(processNameEnd + 2)
      .trim()
      .split(/\s+/);
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

function getOptions(options: CrawlerRunLockOptions = {}) {
  return {
    afterStaleLockQuarantine: options.afterStaleLockQuarantine,
    beforeStaleLockRemoval: options.beforeStaleLockRemoval,
    getPidStartedAt: options.getPidStartedAt ?? getLinuxPidStartedAt,
    lockPath: options.lockPath ?? DEFAULT_LOCK_PATH,
    pidExists: options.pidExists ?? defaultPidExists,
    staleMs: options.staleMs ?? getDefaultStaleMs(),
  };
}

function toRunState(record: CrawlerRunLockRecord): CrawlerRunState {
  return {
    running: true,
    pid: record.pid,
    source: record.source,
    startedAt: record.startedAt,
  };
}

function isExpired(startedAt: string, staleMs: number): boolean {
  const startedAtMs = Date.parse(startedAt);
  return Number.isNaN(startedAtMs) || Date.now() - startedAtMs > staleMs;
}

function parseLockRecord(contents: string): CrawlerRunLockRecord | null {
  let parsed: Partial<CrawlerRunLockRecord>;
  try {
    parsed = JSON.parse(contents) as Partial<CrawlerRunLockRecord>;
  } catch {
    return null;
  }

  const pidStartedAt =
    parsed.pidStartedAt === undefined || parsed.pidStartedAt === null ? null : parsed.pidStartedAt;

  if (
    typeof parsed.id !== "string" ||
    typeof parsed.pid !== "number" ||
    (pidStartedAt !== null && typeof pidStartedAt !== "string") ||
    typeof parsed.source !== "string" ||
    typeof parsed.startedAt !== "string"
  ) {
    return null;
  }

  return {
    id: parsed.id,
    pid: parsed.pid,
    pidStartedAt,
    source: parsed.source,
    startedAt: parsed.startedAt,
  };
}

async function readLockSnapshot(lockPath: string): Promise<LockFileSnapshot | null> {
  let file: Awaited<ReturnType<typeof open>>;
  try {
    file = await open(lockPath, "r");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  try {
    const contents = await file.readFile("utf8");
    const stats = await file.stat();
    return {
      contents,
      device: stats.dev,
      inode: stats.ino,
      mtimeMs: stats.mtimeMs,
      record: parseLockRecord(contents),
    };
  } finally {
    await file.close();
  }
}

async function readLockRecord(lockPath: string): Promise<CrawlerRunLockRecord | null> {
  return (await readLockSnapshot(lockPath))?.record ?? null;
}

async function tryAcquireLockMutationGuard(lockPath: string): Promise<LockMutationGuard | null> {
  const guardPath = `${lockPath}.mutation`;
  let file: Awaited<ReturnType<typeof open>>;

  try {
    file = await open(guardPath, "wx");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      return null;
    }
    throw err;
  }

  return {
    release: async () => {
      try {
        await file.close();
      } finally {
        await rm(guardPath, { force: true });
      }
    },
  };
}

function isStaleLock(
  record: CrawlerRunLockRecord,
  options: ReturnType<typeof getOptions>,
): boolean {
  if (!options.pidExists(record.pid)) {
    return true;
  }

  if (record.pidStartedAt) {
    const currentPidStartedAt = options.getPidStartedAt(record.pid);
    if (currentPidStartedAt && currentPidStartedAt !== record.pidStartedAt) {
      return true;
    }
  }

  return isExpired(record.startedAt, options.staleMs);
}

async function removeStaleLockIfCurrent(
  lockPath: string,
  expected: LockFileSnapshot,
  beforeRemoval?: () => Promise<void>,
  afterQuarantine?: () => Promise<void>,
): Promise<StaleLockRemovalResult> {
  const mutationGuard = await tryAcquireLockMutationGuard(lockPath);
  if (!mutationGuard) {
    return "busy";
  }

  const quarantinePath = `${lockPath}.stale-${randomUUID()}`;

  try {
    try {
      await beforeRemoval?.();
      await rename(lockPath, quarantinePath);
      await afterQuarantine?.();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return "changed";
      }
      throw err;
    }

    const current = await readLockSnapshot(quarantinePath);
    if (
      current &&
      current.device === expected.device &&
      current.inode === expected.inode &&
      current.contents === expected.contents
    ) {
      await rm(quarantinePath, { force: true });
      return "removed";
    }

    try {
      await link(quarantinePath, lockPath);
      await rm(quarantinePath, { force: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
        throw err;
      }
    }

    return "changed";
  } finally {
    await mutationGuard.release();
  }
}

export async function getCrawlerRunState(
  options: CrawlerRunLockOptions = {},
): Promise<CrawlerRunState> {
  const resolved = getOptions(options);
  const snapshot = await readLockSnapshot(resolved.lockPath);

  if (!snapshot) {
    return { running: false, pid: null, source: null, startedAt: null };
  }

  const { record } = snapshot;
  const snapshotState = record
    ? toRunState(record)
    : {
        running: true as const,
        pid: null,
        source: null,
        startedAt: new Date(snapshot.mtimeMs).toISOString(),
      };
  const isStale = record
    ? isStaleLock(record, resolved)
    : Date.now() - snapshot.mtimeMs > resolved.staleMs;

  if (!isStale) {
    return snapshotState;
  }

  const removal = await removeStaleLockIfCurrent(
    resolved.lockPath,
    snapshot,
    resolved.beforeStaleLockRemoval,
    resolved.afterStaleLockQuarantine,
  );
  if (removal === "removed") {
    return { running: false, pid: null, source: null, startedAt: null };
  }
  if (removal === "changed") {
    return getCrawlerRunState(options);
  }

  return snapshotState;
}

export async function acquireCrawlerRunLock(
  source: string,
  options: CrawlerRunLockOptions = {},
): Promise<CrawlerRunLock> {
  const resolved = getOptions(options);
  await mkdir(path.dirname(resolved.lockPath), { recursive: true });

  const mutationGuard = await tryAcquireLockMutationGuard(resolved.lockPath);
  if (!mutationGuard) {
    throw new CrawlerAlreadyRunningError({
      running: true,
      pid: null,
      source: null,
      startedAt: null,
    });
  }

  const record: CrawlerRunLockRecord = {
    id: randomUUID(),
    pid: process.pid,
    pidStartedAt: resolved.getPidStartedAt(process.pid),
    source,
    startedAt: new Date().toISOString(),
  };

  let file: Awaited<ReturnType<typeof open>> | null = null;
  let lockExists = false;
  try {
    file = await open(resolved.lockPath, "wx");
    await file.writeFile(JSON.stringify(record));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
    lockExists = true;
  } finally {
    try {
      await file?.close();
    } finally {
      await mutationGuard.release();
    }
  }

  if (lockExists) {
    const state = await getCrawlerRunState(options);
    if (!state.running) {
      return acquireCrawlerRunLock(source, options);
    }
    throw new CrawlerAlreadyRunningError(state);
  }

  return {
    record,
    release: async () => {
      const current = await readLockRecord(resolved.lockPath);
      if (current?.id === record.id) {
        await rm(resolved.lockPath, { force: true });
      }
    },
  };
}

export async function runWithCrawlerRunLock<T>(
  source: string,
  task: () => Promise<T>,
  options: CrawlerRunLockOptions = {},
): Promise<T> {
  const lock = await acquireCrawlerRunLock(source, options);
  try {
    return await task();
  } finally {
    await lock.release();
  }
}
