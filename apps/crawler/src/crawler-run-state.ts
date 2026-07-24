import { randomUUID } from "node:crypto";
import { open, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

const DEFAULT_STATE_PATH = path.resolve(
  import.meta.dirname,
  "../../../data/crawler-run-state.json",
);

export type CrawlerRunStepStatus =
  | "pending"
  | "running"
  | "done"
  | "warning"
  | "failed"
  | "skipped";

export type CrawlerRunReason =
  | { code: "auth_failed"; message: string }
  | {
      code: "refresh_timeout";
      message: string;
      maxWaitMinutes: number;
      incompleteAccounts: string[];
    }
  | { code: "moneyforward_timeout"; message: string; operation: string; timeoutMs: number }
  | { code: "navigation_failed"; message: string; url: string }
  | { code: "selector_not_found"; message: string; selector: string }
  | { code: "unknown_error"; message: string };

interface CrawlerRunGroupMetadata {
  kind: "group";
  groupName: string;
}

interface CrawlerRunMonthMetadata {
  kind: "month";
  month: string;
}

interface CrawlerRunRefreshMetadata {
  kind: "refresh";
  maxWaitMinutes: number;
  remainingAccounts: number;
  incompleteAccounts: string[];
}

export type CrawlerRunStepDetails =
  | { step: "authentication"; metadata: null }
  | { step: "group_list"; metadata: null }
  | { step: "moneyforward_refresh"; metadata: CrawlerRunRefreshMetadata }
  | { step: "registered_accounts"; metadata: null }
  | { step: "portfolio"; metadata: null }
  | { step: "liabilities"; metadata: null }
  | { step: "global_data"; metadata: null }
  | { step: "group_data"; metadata: CrawlerRunGroupMetadata }
  | { step: "cash_flow_history"; metadata: CrawlerRunMonthMetadata }
  | { step: "database_save"; metadata: null }
  | { step: "institution_categories"; metadata: null }
  | { step: "analytics"; metadata: null }
  | { step: "notification"; metadata: null }
  | { step: "web_cache_refresh"; metadata: null };

type CrawlerRunTimelineStatusDetails =
  | { status: "pending"; startedAt: null; finishedAt: null; reason: null }
  | { status: "running"; startedAt: string; finishedAt: null; reason: null }
  | { status: "done"; startedAt: string; finishedAt: string; reason: null }
  | {
      status: "warning" | "failed";
      startedAt: string;
      finishedAt: string;
      reason: CrawlerRunReason;
    }
  | { status: "skipped"; startedAt: null; finishedAt: string; reason: null };

export type CrawlerRunTimelineItem = {
  id: string;
  label: string;
} & CrawlerRunStepDetails &
  CrawlerRunTimelineStatusDetails;

export type CrawlerRunCurrent = {
  timelineItemId: string;
  label: string;
} & CrawlerRunStepDetails;

export interface CrawlerRunProgress {
  completed: number;
  total: number;
}

interface CrawlerRunStateBase {
  version: 1;
  runId: string;
  source: string;
  startedAt: string;
  timeline: CrawlerRunTimelineItem[];
}

export type CrawlerRunStateSnapshot =
  | (CrawlerRunStateBase & {
      runStatus: "running";
      finishedAt: null;
      current: CrawlerRunCurrent | null;
      progress: CrawlerRunProgress | null;
      reason: null;
    })
  | (CrawlerRunStateBase & {
      runStatus: "success";
      finishedAt: string;
      current: null;
      progress: CrawlerRunProgress;
      reason: null;
    })
  | (CrawlerRunStateBase & {
      runStatus: "failed";
      finishedAt: string;
      current: CrawlerRunCurrent | null;
      progress: CrawlerRunProgress | null;
      reason: CrawlerRunReason;
    });

export interface CrawlerRunStateFileOptions {
  statePath?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isCrawlerRunReason(value: unknown): value is CrawlerRunReason {
  if (!isRecord(value) || typeof value.message !== "string") {
    return false;
  }

  switch (value.code) {
    case "auth_failed":
    case "unknown_error":
      return true;
    case "refresh_timeout":
      return (
        isNonNegativeFiniteNumber(value.maxWaitMinutes) && isStringArray(value.incompleteAccounts)
      );
    case "moneyforward_timeout":
      return typeof value.operation === "string" && isNonNegativeFiniteNumber(value.timeoutMs);
    case "navigation_failed":
      return typeof value.url === "string";
    case "selector_not_found":
      return typeof value.selector === "string";
    default:
      return false;
  }
}

function isCrawlerRunStepDetails(value: Record<string, unknown>): boolean {
  const metadata = value.metadata;

  switch (value.step) {
    case "authentication":
    case "group_list":
    case "registered_accounts":
    case "portfolio":
    case "liabilities":
    case "global_data":
    case "database_save":
    case "institution_categories":
    case "analytics":
    case "notification":
    case "web_cache_refresh":
      return metadata === null;
    case "moneyforward_refresh":
      return (
        isRecord(metadata) &&
        metadata.kind === "refresh" &&
        isNonNegativeFiniteNumber(metadata.maxWaitMinutes) &&
        isNonNegativeInteger(metadata.remainingAccounts) &&
        isStringArray(metadata.incompleteAccounts)
      );
    case "group_data":
      return (
        isRecord(metadata) && metadata.kind === "group" && typeof metadata.groupName === "string"
      );
    case "cash_flow_history":
      return isRecord(metadata) && metadata.kind === "month" && typeof metadata.month === "string";
    default:
      return false;
  }
}

function isCrawlerRunTimelineItem(value: unknown): value is CrawlerRunTimelineItem {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.label !== "string" ||
    !isCrawlerRunStepDetails(value)
  ) {
    return false;
  }

  switch (value.status) {
    case "pending":
      return value.startedAt === null && value.finishedAt === null && value.reason === null;
    case "running":
      return (
        typeof value.startedAt === "string" && value.finishedAt === null && value.reason === null
      );
    case "done":
      return (
        typeof value.startedAt === "string" &&
        typeof value.finishedAt === "string" &&
        value.reason === null
      );
    case "warning":
    case "failed":
      return (
        typeof value.startedAt === "string" &&
        typeof value.finishedAt === "string" &&
        isCrawlerRunReason(value.reason)
      );
    case "skipped":
      return (
        value.startedAt === null && typeof value.finishedAt === "string" && value.reason === null
      );
    default:
      return false;
  }
}

function isCrawlerRunCurrent(value: unknown): value is CrawlerRunCurrent {
  return (
    isRecord(value) &&
    typeof value.timelineItemId === "string" &&
    typeof value.label === "string" &&
    isCrawlerRunStepDetails(value)
  );
}

function isCrawlerRunProgress(value: unknown): value is CrawlerRunProgress {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.completed) &&
    isNonNegativeInteger(value.total) &&
    value.completed <= value.total
  );
}

function isCrawlerRunStateSnapshot(value: unknown): value is CrawlerRunStateSnapshot {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.runId !== "string" ||
    typeof value.source !== "string" ||
    typeof value.startedAt !== "string" ||
    !Array.isArray(value.timeline) ||
    !value.timeline.every(isCrawlerRunTimelineItem)
  ) {
    return false;
  }

  switch (value.runStatus) {
    case "running":
      return (
        value.finishedAt === null &&
        (value.current === null || isCrawlerRunCurrent(value.current)) &&
        (value.progress === null || isCrawlerRunProgress(value.progress)) &&
        value.reason === null
      );
    case "success":
      return (
        typeof value.finishedAt === "string" &&
        value.current === null &&
        isCrawlerRunProgress(value.progress) &&
        value.reason === null
      );
    case "failed":
      return (
        typeof value.finishedAt === "string" &&
        (value.current === null || isCrawlerRunCurrent(value.current)) &&
        (value.progress === null || isCrawlerRunProgress(value.progress)) &&
        isCrawlerRunReason(value.reason)
      );
    default:
      return false;
  }
}

export function getCrawlerRunStatePath(options: CrawlerRunStateFileOptions = {}): string {
  return options.statePath ?? DEFAULT_STATE_PATH;
}

export async function readCrawlerRunState(
  options: CrawlerRunStateFileOptions = {},
): Promise<CrawlerRunStateSnapshot | null> {
  let contents: string;
  try {
    contents = await readFile(getCrawlerRunStatePath(options), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }

  try {
    const value: unknown = JSON.parse(contents);
    return isCrawlerRunStateSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

export async function writeCrawlerRunState(
  state: CrawlerRunStateSnapshot,
  options: CrawlerRunStateFileOptions = {},
): Promise<void> {
  const statePath = getCrawlerRunStatePath(options);
  await mkdir(path.dirname(statePath), { recursive: true });

  const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
  let file: Awaited<ReturnType<typeof open>> | null = null;
  try {
    file = await open(temporaryPath, "wx", 0o600);
    await file.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
    await file.sync();
    await file.close();
    file = null;
    await rename(temporaryPath, statePath);
    await syncDirectory(path.dirname(statePath));
  } finally {
    await file?.close();
    await rm(temporaryPath, { force: true });
  }
}

async function syncDirectory(directoryPath: string): Promise<void> {
  let directory: Awaited<ReturnType<typeof open>> | null = null;
  try {
    directory = await open(directoryPath, "r");
    await directory.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!code || !["EBADF", "EINVAL", "EISDIR", "ENOSYS", "ENOTSUP", "EPERM"].includes(code)) {
      throw error;
    }
  } finally {
    await directory?.close();
  }
}
