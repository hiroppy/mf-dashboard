import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { link, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { createCrawlerProgressReporter, type CrawlerProgressReporter } from "./crawler-progress.js";
import {
  getCrawlerRunStatePath,
  readCrawlerRunState,
  writeCrawlerRunState,
  type CrawlerRunReason,
  type CrawlerRunStateSnapshot,
  type CrawlerRunTimelineItem,
} from "./crawler-run-state.js";

const DEFAULT_LOCK_PATH = path.resolve(import.meta.dirname, "../../../data/crawler-run.lock");
const DEFAULT_MAX_WAIT_MINUTES = 20;
const LOCK_STALE_BUFFER_MINUTES = 100;
const LOCK_MUTATION_INTENT_STALE_MS = 60_000;

export interface CrawlerRunState {
  runId?: string;
  running: boolean;
  pid: number | null;
  source: string | null;
  startedAt: string | null;
  version?: 1;
  finishedAt?: string | null;
  runStatus?: CrawlerRunStateSnapshot["runStatus"];
  current?: CrawlerRunStateSnapshot["current"];
  progress?: CrawlerRunStateSnapshot["progress"];
  reason?: CrawlerRunStateSnapshot["reason"];
  timeline?: CrawlerRunStateSnapshot["timeline"];
}

export function getCrawlerRunLockPath(): string {
  return DEFAULT_LOCK_PATH;
}

interface CrawlerRunLockRecord {
  id: string;
  pid: number;
  pidStartedAt: string | null;
  source: string;
  startedAt: string;
}

interface CrawlerRunLockOptions {
  afterLockMutationGuardAcquired?: () => Promise<void>;
  afterLockMutationGuardBlocked?: () => Promise<void>;
  afterLockMutationIntentPublished?: () => Promise<void>;
  afterStaleLockQuarantine?: () => Promise<void>;
  beforeStaleLockCleanup?: () => Promise<void>;
  beforeStaleLockRemoval?: () => Promise<void>;
  lockPath?: string;
  getPidStartedAt?: (pid: number) => string | null;
  pidExists?: (pid: number) => boolean;
  staleMs?: number;
  statePath?: string;
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

type StaleLockRemovalResult =
  | { kind: "busy" | "changed" }
  | { kind: "removed"; state: CrawlerRunState };

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
    afterLockMutationGuardAcquired: options.afterLockMutationGuardAcquired,
    afterLockMutationGuardBlocked: options.afterLockMutationGuardBlocked,
    afterLockMutationIntentPublished: options.afterLockMutationIntentPublished,
    afterStaleLockQuarantine: options.afterStaleLockQuarantine,
    beforeStaleLockCleanup: options.beforeStaleLockCleanup,
    beforeStaleLockRemoval: options.beforeStaleLockRemoval,
    getPidStartedAt: options.getPidStartedAt ?? getLinuxPidStartedAt,
    lockPath: options.lockPath ?? DEFAULT_LOCK_PATH,
    pidExists: options.pidExists ?? defaultPidExists,
    staleMs: options.staleMs ?? getDefaultStaleMs(),
    statePath:
      options.statePath ??
      process.env.CRAWLER_STATE_PATH ??
      (options.lockPath ? `${options.lockPath}.state` : getCrawlerRunStatePath()),
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

async function toStoppedRunState(
  progressState: CrawlerRunStateSnapshot,
  statePath: string,
): Promise<CrawlerRunState> {
  if (progressState.runStatus !== "running") {
    return { ...progressState, running: false, pid: null };
  }

  const finishedAt = new Date().toISOString();
  const reason: CrawlerRunReason = {
    code: "unknown_error",
    message: "前回の実行は完了を確認できませんでした",
  };
  const timeline = progressState.timeline.map((item): CrawlerRunTimelineItem => {
    if (item.status !== "running") return item;
    return { ...item, status: "failed", finishedAt, reason };
  });
  const failedState: CrawlerRunStateSnapshot = {
    ...progressState,
    runStatus: "failed",
    finishedAt,
    reason,
    progress: {
      completed: timeline.filter(({ status }) => status !== "pending").length,
      total: timeline.length,
    },
    timeline,
  };
  await writeCrawlerRunState(failedState, { statePath });
  return { ...failedState, running: false, pid: null };
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
    if (currentPidStartedAt) {
      return currentPidStartedAt !== record.pidStartedAt;
    }
  }

  return isExpired(record.startedAt, options.staleMs);
}

function isStaleSnapshot(
  snapshot: LockFileSnapshot,
  options: ReturnType<typeof getOptions>,
): boolean {
  return snapshot.record
    ? isStaleLock(snapshot.record, options)
    : Date.now() - snapshot.mtimeMs > options.staleMs;
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
        await options.afterLockMutationGuardBlocked?.();
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
        await options.afterLockMutationGuardBlocked?.();
        await rm(candidatePath, { force: true });
        return null;
      }

      await rename(candidatePath, ownerPath);
      await options.afterLockMutationGuardAcquired?.();
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

async function waitForLockMutationGuard(
  options: ReturnType<typeof getOptions>,
): Promise<LockMutationGuard> {
  while (true) {
    const mutationGuard = await tryAcquireLockMutationGuard(options);
    if (mutationGuard) {
      return mutationGuard;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function getQuarantinePaths(lockPath: string): Promise<string[]> {
  const directory = path.dirname(lockPath);
  const quarantinePrefix = `${path.basename(lockPath)}.stale-`;
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  return names
    .filter((name) => name.startsWith(quarantinePrefix))
    .sort()
    .map((name) => path.join(directory, name));
}

async function recoverQuarantinedLock(lockPath: string): Promise<void> {
  for (const quarantinePath of await getQuarantinePaths(lockPath)) {
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
    return { kind: "busy" };
  }

  const quarantinePath = `${options.lockPath}.stale-${randomUUID()}`;

  try {
    try {
      await options.beforeStaleLockRemoval?.();
      await rename(options.lockPath, quarantinePath);
      await options.afterStaleLockQuarantine?.();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { kind: "changed" };
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
      const latestProgressState = await readCrawlerRunState({ statePath: options.statePath });
      const state = latestProgressState
        ? await toStoppedRunState(latestProgressState, options.statePath)
        : { running: false as const, pid: null, source: null, startedAt: null };
      return { kind: "removed", state };
    }

    try {
      await link(quarantinePath, options.lockPath);
      await rm(quarantinePath, { force: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
        throw err;
      }
    }

    return { kind: "changed" };
  } finally {
    await mutationGuard.release();
  }
}

export async function getCrawlerRunState(
  options: CrawlerRunLockOptions = {},
): Promise<CrawlerRunState> {
  const resolved = getOptions(options);
  const progressState = await readCrawlerRunState({ statePath: resolved.statePath });
  await mkdir(path.dirname(resolved.lockPath), { recursive: true });
  let snapshot = await readLockSnapshot(resolved.lockPath);

  if (!snapshot) {
    const mutationGuard = await tryAcquireLockMutationGuard(resolved);
    if (!mutationGuard) {
      return toUnknownRunningState();
    }
    try {
      await recoverQuarantinedLock(resolved.lockPath);
      snapshot = await readLockSnapshot(resolved.lockPath);
      if (!snapshot) {
        const latestProgressState = await readCrawlerRunState({ statePath: resolved.statePath });
        return latestProgressState
          ? await toStoppedRunState(latestProgressState, resolved.statePath)
          : { running: false, pid: null, source: null, startedAt: null };
      }
    } finally {
      await mutationGuard.release();
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

  if (!isStaleSnapshot(snapshot, resolved)) {
    if (record && progressState?.runId === record.id) {
      return { ...progressState, running: true, pid: record.pid };
    }
    return snapshotState;
  }

  await resolved.beforeStaleLockCleanup?.();
  const removal = await removeStaleLockIfCurrent(snapshot, resolved);
  if (removal.kind === "removed") {
    return removal.state;
  }
  if (removal.kind === "changed") {
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

  let mutationGuard = await tryAcquireLockMutationGuard(resolved);
  while (!mutationGuard) {
    const snapshot = await readLockSnapshot(resolved.lockPath);
    if (snapshot && !isStaleSnapshot(snapshot, resolved)) {
      throw new CrawlerAlreadyRunningError(toUnknownRunningState());
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
    mutationGuard = await tryAcquireLockMutationGuard(resolved);
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
    throw new CrawlerAlreadyRunningError(state);
  }

  return {
    record,
    release: async () => {
      const mutationGuard = await waitForLockMutationGuard(resolved);
      try {
        const current = await readLockRecord(resolved.lockPath);
        if (current?.id === record.id) {
          await rm(resolved.lockPath, { force: true });
        }
      } finally {
        await mutationGuard.release();
      }
    },
  };
}

export async function runWithCrawlerRunLock<T>(
  source: string,
  task: (progress: CrawlerProgressReporter) => Promise<T>,
  options: CrawlerRunLockOptions = {},
): Promise<T> {
  const lock = await acquireCrawlerRunLock(source, options);
  let progress: CrawlerProgressReporter;
  try {
    progress = await createCrawlerProgressReporter(getOptions(options).statePath, lock.record);
  } catch (err) {
    await lock.release();
    throw err;
  }
  try {
    const result = await task(progress);
    await progress.finish("success");
    return result;
  } catch (err) {
    try {
      await progress.finish("failed");
    } catch (finishError) {
      throw new AggregateError(
        [err, finishError],
        "Crawler run failed and its terminal state could not be saved",
        { cause: err },
      );
    }
    throw err;
  } finally {
    await lock.release();
  }
}
