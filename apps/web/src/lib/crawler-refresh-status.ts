export type CrawlerRunStatus = "running" | "success" | "failed";

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

export type CrawlerRunStepDetails =
  | { step: "authentication"; metadata: null }
  | {
      step: "moneyforward_refresh";
      metadata: {
        kind: "refresh";
        maxWaitMinutes: number;
        remainingAccounts: number;
        incompleteAccounts: string[];
      };
    }
  | { step: "global_data"; metadata: null }
  | { step: "group_data"; metadata: { kind: "group"; groupName: string } }
  | { step: "cash_flow_history"; metadata: { kind: "month"; month: string } }
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
      waitingFor: string | null;
      progress: CrawlerRunProgress | null;
      reason: null;
    })
  | (CrawlerRunStateBase & {
      runStatus: "success";
      finishedAt: string;
      current: null;
      waitingFor: null;
      progress: CrawlerRunProgress;
      reason: null;
    })
  | (CrawlerRunStateBase & {
      runStatus: "failed";
      finishedAt: string;
      current: CrawlerRunCurrent | null;
      waitingFor: null;
      progress: CrawlerRunProgress | null;
      reason: CrawlerRunReason;
    });

export interface CrawlerRefreshStatus {
  available: boolean;
  running: boolean;
  source: string | null;
  startedAt: string | null;
  latestRun: CrawlerRunStateSnapshot | null;
}

export const unavailableCrawlerRefreshStatus: CrawlerRefreshStatus = {
  available: false,
  running: false,
  source: null,
  startedAt: null,
  latestRun: null,
};

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

function readReason(value: unknown): CrawlerRunReason | null {
  if (!isRecord(value) || typeof value.message !== "string") {
    return null;
  }

  switch (value.code) {
    case "auth_failed":
    case "unknown_error":
      return { code: value.code, message: value.message };
    case "refresh_timeout":
      return isNonNegativeFiniteNumber(value.maxWaitMinutes) &&
        isStringArray(value.incompleteAccounts)
        ? {
            code: value.code,
            message: value.message,
            maxWaitMinutes: value.maxWaitMinutes,
            incompleteAccounts: value.incompleteAccounts,
          }
        : null;
    case "moneyforward_timeout":
      return typeof value.operation === "string" && isNonNegativeFiniteNumber(value.timeoutMs)
        ? {
            code: value.code,
            message: value.message,
            operation: value.operation,
            timeoutMs: value.timeoutMs,
          }
        : null;
    case "navigation_failed":
      return typeof value.url === "string"
        ? { code: value.code, message: value.message, url: value.url }
        : null;
    case "selector_not_found":
      return typeof value.selector === "string"
        ? { code: value.code, message: value.message, selector: value.selector }
        : null;
    default:
      return null;
  }
}

function readStepDetails(value: Record<string, unknown>): CrawlerRunStepDetails | null {
  switch (value.step) {
    case "authentication":
    case "global_data":
    case "database_save":
    case "institution_categories":
    case "analytics":
    case "notification":
    case "web_cache_refresh":
      return value.metadata === null ? { step: value.step, metadata: null } : null;
    case "group_data":
      return isRecord(value.metadata) &&
        value.metadata.kind === "group" &&
        typeof value.metadata.groupName === "string"
        ? {
            step: value.step,
            metadata: { kind: "group", groupName: value.metadata.groupName },
          }
        : null;
    case "cash_flow_history":
      return isRecord(value.metadata) &&
        value.metadata.kind === "month" &&
        typeof value.metadata.month === "string"
        ? { step: value.step, metadata: { kind: "month", month: value.metadata.month } }
        : null;
    case "moneyforward_refresh":
      return isRecord(value.metadata) &&
        value.metadata.kind === "refresh" &&
        isNonNegativeFiniteNumber(value.metadata.maxWaitMinutes) &&
        isNonNegativeInteger(value.metadata.remainingAccounts) &&
        isStringArray(value.metadata.incompleteAccounts)
        ? {
            step: value.step,
            metadata: {
              kind: "refresh",
              maxWaitMinutes: value.metadata.maxWaitMinutes,
              remainingAccounts: value.metadata.remainingAccounts,
              incompleteAccounts: value.metadata.incompleteAccounts,
            },
          }
        : null;
    default:
      return null;
  }
}

function readTimelineItem(value: unknown): CrawlerRunTimelineItem | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.label !== "string") {
    return null;
  }
  const details = readStepDetails(value);
  if (!details) {
    return null;
  }

  const startedAt = typeof value.startedAt === "string" ? value.startedAt : null;
  const finishedAt = typeof value.finishedAt === "string" ? value.finishedAt : null;
  const reason = readReason(value.reason);
  switch (value.status) {
    case "pending":
      if (value.startedAt !== null || value.finishedAt !== null || value.reason !== null)
        return null;
      break;
    case "running":
      if (!startedAt || value.finishedAt !== null || value.reason !== null) return null;
      break;
    case "done":
      if (!startedAt || !finishedAt || value.reason !== null) return null;
      break;
    case "warning":
    case "failed":
      if (!startedAt || !finishedAt || !reason) return null;
      break;
    case "skipped":
      if (value.startedAt !== null || !finishedAt || value.reason !== null) return null;
      break;
    default:
      return null;
  }

  return {
    id: value.id,
    label: value.label,
    status: value.status,
    startedAt,
    finishedAt,
    reason,
    ...details,
  } as CrawlerRunTimelineItem;
}

function readCurrent(value: unknown): CrawlerRunCurrent | null {
  if (
    !isRecord(value) ||
    typeof value.timelineItemId !== "string" ||
    typeof value.label !== "string"
  ) {
    return null;
  }
  const details = readStepDetails(value);
  return details ? { timelineItemId: value.timelineItemId, label: value.label, ...details } : null;
}

function readProgress(value: unknown): CrawlerRunProgress | null {
  return isRecord(value) &&
    isNonNegativeInteger(value.completed) &&
    isNonNegativeInteger(value.total) &&
    value.completed <= value.total
    ? { completed: value.completed, total: value.total }
    : null;
}

function readLatestRun(value: unknown): CrawlerRunStateSnapshot | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.runId !== "string" ||
    typeof value.source !== "string" ||
    typeof value.startedAt !== "string" ||
    !Array.isArray(value.timeline)
  ) {
    return null;
  }

  const timeline = value.timeline.map(readTimelineItem);
  if (timeline.some((item) => item === null)) {
    return null;
  }
  const base = {
    version: 1 as const,
    runId: value.runId,
    source: value.source,
    startedAt: value.startedAt,
    timeline: timeline as CrawlerRunTimelineItem[],
  };
  const current = value.current === null ? null : readCurrent(value.current);
  const progress = value.progress === null ? null : readProgress(value.progress);

  switch (value.runStatus) {
    case "running":
      if (
        value.finishedAt !== null ||
        (value.current !== null && !current) ||
        (value.waitingFor !== null && typeof value.waitingFor !== "string") ||
        (value.progress !== null && !progress) ||
        value.reason !== null
      ) {
        return null;
      }
      return {
        ...base,
        runStatus: value.runStatus,
        finishedAt: null,
        current,
        waitingFor: value.waitingFor,
        progress,
        reason: null,
      };
    case "success":
      if (
        typeof value.finishedAt !== "string" ||
        value.current !== null ||
        value.waitingFor !== null ||
        !progress ||
        value.reason !== null
      ) {
        return null;
      }
      return {
        ...base,
        runStatus: value.runStatus,
        finishedAt: value.finishedAt,
        current: null,
        waitingFor: null,
        progress,
        reason: null,
      };
    case "failed": {
      const reason = readReason(value.reason);
      if (
        typeof value.finishedAt !== "string" ||
        (value.current !== null && !current) ||
        value.waitingFor !== null ||
        (value.progress !== null && !progress) ||
        !reason
      ) {
        return null;
      }
      return {
        ...base,
        runStatus: value.runStatus,
        finishedAt: value.finishedAt,
        current,
        waitingFor: null,
        progress,
        reason,
      };
    }
    default:
      return null;
  }
}

export function parseCrawlerRefreshStatus(value: unknown, responseOk = true): CrawlerRefreshStatus {
  if (!isRecord(value)) {
    return unavailableCrawlerRefreshStatus;
  }

  const latestRun = readLatestRun(value.latestRun ?? value);
  const running = value.running === true || latestRun?.runStatus === "running";
  return {
    available: responseOk && value.available !== false,
    running,
    source: typeof value.source === "string" ? value.source : (latestRun?.source ?? null),
    startedAt:
      typeof value.startedAt === "string" ? value.startedAt : (latestRun?.startedAt ?? null),
    latestRun,
  };
}
