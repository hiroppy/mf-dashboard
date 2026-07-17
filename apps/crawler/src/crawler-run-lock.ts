import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { link, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

const DEFAULT_LOCK_PATH = path.resolve(import.meta.dirname, "../../../data/crawler-run.lock");
const DEFAULT_MAX_WAIT_MINUTES = 20;
const LOCK_STALE_BUFFER_MINUTES = 100;
const LOCK_MUTATION_INTENT_STALE_MS = 60_000;

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
  afterLockMutationIntentPublished?: () => Promise<void>;
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

interface LockMutationIntentRecord {
  createdAt: string;
  pid: number;
  pidStartedAt: string | null;
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
    afterLockMutationIntentPublished: options.afterLockMutationIntentPublished,
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

function toUnknownRunningState(): CrawlerRunState {
  return { running: true, pid: null, source: null, startedAt: null };
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

function parseLockMutationIntent(contents: string): LockMutationIntentRecord | null {
  try {
    const parsed = JSON.parse(contents) as Partial<LockMutationIntentRecord>;
    if (
      typeof parsed.createdAt !== "string" ||
      typeof parsed.pid !== "number" ||
      (parsed.pidStartedAt !== null && typeof parsed.pidStartedAt !== "string")
    ) {
      return null;
    }
    return {
      createdAt: parsed.createdAt,
      pid: parsed.pid,
      pidStartedAt: parsed.pidStartedAt,
    };
  } catch {
    return null;
  }
}

function isLockMutationIntentActive(record: LockMutationIntentRecord | null): boolean {
  if (
    !record ||
    isExpired(record.createdAt, LOCK_MUTATION_INTENT_STALE_MS) ||
    !defaultPidExists(record.pid)
  ) {
    return false;
  }

  if (!record.pidStartedAt) {
    return true;
  }

  const currentPidStartedAt = getLinuxPidStartedAt(record.pid);
  return !currentPidStartedAt || currentPidStartedAt === record.pidStartedAt;
}

async function getActiveLockMutationIntents(
  directory: string,
  prefixes: string[],
): Promise<string[]> {
  const activeIntents: string[] = [];
  for (const name of await readdir(directory)) {
    if (!prefixes.some((prefix) => name.startsWith(prefix))) {
      continue;
    }

    const intentPath = path.join(directory, name);
    const snapshot = await readLockSnapshot(intentPath);
    const record = snapshot ? parseLockMutationIntent(snapshot.contents) : null;
    if (isLockMutationIntentActive(record)) {
      activeIntents.push(intentPath);
    } else {
      await rm(intentPath, { force: true });
    }
  }
  return activeIntents.sort();
}

async function tryAcquireLockMutationGuard(
  options: ReturnType<typeof getOptions>,
): Promise<LockMutationGuard | null> {
  const directory = path.dirname(options.lockPath);
  const basename = path.basename(options.lockPath);
  const id = randomUUID();
  // Active intent paths are unique and never reused, so dead owners can be removed by exact path.
  const pendingPath = path.join(directory, `${basename}.mutation-pending-${id}`);
  const candidatePath = path.join(directory, `${basename}.mutation-candidate-${id}`);
  const ownerPath = path.join(directory, `${basename}.mutation-owner-${id}`);
  const candidatePrefix = `${basename}.mutation-candidate-`;
  const ownerPrefixes = [`${basename}.mutation-owner-`, `${basename}.mutation-active-`];
  const record: LockMutationIntentRecord = {
    createdAt: new Date().toISOString(),
    pid: process.pid,
    pidStartedAt: getLinuxPidStartedAt(process.pid),
  };
  let file: Awaited<ReturnType<typeof open>> | null = null;

  try {
    try {
      file = await open(pendingPath, "wx");
      await file.writeFile(JSON.stringify(record));
    } finally {
      await file?.close();
    }
    await rename(pendingPath, candidatePath);
    await options.afterLockMutationIntentPublished?.();
  } catch (err) {
    await rm(pendingPath, { force: true });
    await rm(candidatePath, { force: true });
    throw err;
  }

  try {
    while (true) {
      if ((await getActiveLockMutationIntents(directory, ownerPrefixes)).length > 0) {
        await rm(candidatePath, { force: true });
        return null;
      }

      const candidates = await getActiveLockMutationIntents(directory, [candidatePrefix]);
      if (candidates[0] !== candidatePath) {
        await rm(candidatePath, { force: true });
        return null;
      }
      if (candidates.length > 1) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        continue;
      }

      // Another candidate may have become owner since the initial owner check.
      if ((await getActiveLockMutationIntents(directory, ownerPrefixes)).length > 0) {
        await rm(candidatePath, { force: true });
        return null;
      }

      await rename(candidatePath, ownerPath);
      return {
        release: () => rm(ownerPath, { force: true }),
      };
    }
  } catch (err) {
    await rm(candidatePath, { force: true });
    await rm(ownerPath, { force: true });
    throw err;
  }
}

async function recoverQuarantinedLock(lockPath: string): Promise<void> {
  const directory = path.dirname(lockPath);
  const quarantinePrefix = `${path.basename(lockPath)}.stale-`;

  for (const name of (await readdir(directory)).sort()) {
    if (!name.startsWith(quarantinePrefix)) {
      continue;
    }

    const quarantinePath = path.join(directory, name);
    try {
      await link(quarantinePath, lockPath);
      await rm(quarantinePath, { force: true });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        continue;
      }
      if (code !== "EEXIST") {
        throw err;
      }

      const [quarantined, current] = await Promise.all([
        readLockSnapshot(quarantinePath),
        readLockSnapshot(lockPath),
      ]);
      if (
        quarantined &&
        current &&
        quarantined.device === current.device &&
        quarantined.inode === current.inode
      ) {
        await rm(quarantinePath, { force: true });
      }
      return;
    }
  }
}

async function removeStaleLockIfCurrent(
  expected: LockFileSnapshot,
  options: ReturnType<typeof getOptions>,
): Promise<StaleLockRemovalResult> {
  const mutationGuard = await tryAcquireLockMutationGuard(options);
  if (!mutationGuard) {
    return "busy";
  }

  const quarantinePath = `${options.lockPath}.stale-${randomUUID()}`;

  try {
    try {
      await options.beforeStaleLockRemoval?.();
      await rename(options.lockPath, quarantinePath);
      await options.afterStaleLockQuarantine?.();
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
      await link(quarantinePath, options.lockPath);
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
  let snapshot = await readLockSnapshot(resolved.lockPath);

  if (!snapshot) {
    const mutationGuard = await tryAcquireLockMutationGuard(resolved);
    if (!mutationGuard) {
      return toUnknownRunningState();
    }
    try {
      await recoverQuarantinedLock(resolved.lockPath);
    } finally {
      await mutationGuard.release();
    }

    snapshot = await readLockSnapshot(resolved.lockPath);
    if (!snapshot) {
      return { running: false, pid: null, source: null, startedAt: null };
    }
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

  const removal = await removeStaleLockIfCurrent(snapshot, resolved);
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

  const mutationGuard = await tryAcquireLockMutationGuard(resolved);
  if (!mutationGuard) {
    throw new CrawlerAlreadyRunningError(toUnknownRunningState());
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
    await recoverQuarantinedLock(resolved.lockPath);
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
