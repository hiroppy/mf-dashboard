import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
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

async function readLockRecord(lockPath: string): Promise<CrawlerRunLockRecord | null> {
  try {
    const raw = await readFile(lockPath, "utf8");
    let parsed: Partial<CrawlerRunLockRecord>;
    try {
      parsed = JSON.parse(raw) as Partial<CrawlerRunLockRecord>;
    } catch {
      return null;
    }

    const pidStartedAt =
      parsed.pidStartedAt === undefined || parsed.pidStartedAt === null
        ? null
        : parsed.pidStartedAt;

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
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
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
  record: CrawlerRunLockRecord | null,
  staleMtimeMs?: number,
): Promise<boolean> {
  try {
    const current = await readLockRecord(lockPath);

    if (record) {
      if (current?.id !== record.id) {
        return false;
      }
    } else {
      if (current) {
        return false;
      }

      if (staleMtimeMs !== undefined) {
        const stats = await stat(lockPath);
        if (stats.mtimeMs !== staleMtimeMs) {
          return false;
        }
      }
    }

    await rm(lockPath, { force: true });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

export async function getCrawlerRunState(
  options: CrawlerRunLockOptions = {},
): Promise<CrawlerRunState> {
  const resolved = getOptions(options);
  const record = await readLockRecord(resolved.lockPath);

  if (!record) {
    try {
      const stats = await stat(resolved.lockPath);
      if (Date.now() - stats.mtimeMs > resolved.staleMs) {
        if (await removeStaleLockIfCurrent(resolved.lockPath, record, stats.mtimeMs)) {
          return { running: false, pid: null, source: null, startedAt: null };
        }
        return getCrawlerRunState(options);
      }

      return {
        running: true,
        pid: null,
        source: null,
        startedAt: new Date(stats.mtimeMs).toISOString(),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
      return { running: false, pid: null, source: null, startedAt: null };
    }
  }

  if (isStaleLock(record, resolved)) {
    if (await removeStaleLockIfCurrent(resolved.lockPath, record)) {
      return { running: false, pid: null, source: null, startedAt: null };
    }
    return getCrawlerRunState(options);
  }

  return toRunState(record);
}

export async function acquireCrawlerRunLock(
  source: string,
  options: CrawlerRunLockOptions = {},
): Promise<CrawlerRunLock> {
  const resolved = getOptions(options);
  await mkdir(path.dirname(resolved.lockPath), { recursive: true });

  const record: CrawlerRunLockRecord = {
    id: randomUUID(),
    pid: process.pid,
    pidStartedAt: resolved.getPidStartedAt(process.pid),
    source,
    startedAt: new Date().toISOString(),
  };

  let file: Awaited<ReturnType<typeof open>> | null = null;
  try {
    file = await open(resolved.lockPath, "wx");
    await file.writeFile(JSON.stringify(record));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }

    const state = await getCrawlerRunState(options);
    if (!state.running) {
      return acquireCrawlerRunLock(source, options);
    }
    throw new CrawlerAlreadyRunningError(state);
  } finally {
    await file?.close();
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
