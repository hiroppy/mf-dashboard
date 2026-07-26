import { randomUUID } from "node:crypto";
import {
  getCrawlerRunStatePath,
  writeCrawlerRunState,
  type CrawlerRunCurrent,
  type CrawlerRunReason,
  type CrawlerRunStateSnapshot,
  type CrawlerRunStepDetails,
  type CrawlerRunTimelineItem,
} from "./crawler-run-state.js";

export type CrawlerStepMetadata = Record<string, string | number | string[]>;
export type CrawlerReason = CrawlerRunReason;

export interface CrawlerCurrentStep {
  code: CrawlerRunStepDetails["step"];
  label: string;
  metadata?: CrawlerStepMetadata;
}

export const CRAWLER_STEPS = {
  authentication: { code: "authentication", label: "MoneyForward に認証" },
  groupList: { code: "group_list", label: "グループ一覧を取得" },
  refresh: { code: "moneyforward_refresh", label: "金融機関データを一括更新" },
  registeredAccounts: { code: "registered_accounts", label: "登録口座を取得" },
  portfolio: { code: "portfolio", label: "ポートフォリオを取得" },
  liabilities: { code: "liabilities", label: "負債を取得" },
  groupData: { code: "group_data", label: "グループデータを取得" },
  monthlyCashFlow: { code: "cash_flow_history", label: "月次入出金を取得" },
  databaseSave: { code: "database_save", label: "データベースに保存" },
  institutionCategories: {
    code: "institution_categories",
    label: "金融機関カテゴリを更新",
  },
  analytics: { code: "analytics", label: "金融データを分析" },
  notification: { code: "notification", label: "更新結果を通知" },
  webCacheRefresh: { code: "web_cache_refresh", label: "Web キャッシュを更新" },
} as const satisfies Record<string, CrawlerCurrentStep>;

const BASELINE_STEP_COUNT = Object.keys(CRAWLER_STEPS).length;

export interface CrawlerProgressReporter {
  getState: () => CrawlerRunStateSnapshot;
  startStep: (step: CrawlerCurrentStep, metadata?: CrawlerStepMetadata) => Promise<string>;
  updateStep: (stepId: string, metadata?: CrawlerStepMetadata) => Promise<void>;
  completeStep: (stepId: string, metadata?: CrawlerStepMetadata) => Promise<void>;
  skipStep: (stepId: string) => Promise<void>;
  warnStep: (
    stepId: string,
    reason: CrawlerReason,
    metadata?: CrawlerStepMetadata,
  ) => Promise<void>;
  failStep: (stepId: string, reason: CrawlerReason) => Promise<void>;
  finish: (status: "success" | "failed", reason?: CrawlerReason) => Promise<void>;
}

interface CrawlerProgressReporterOptions {
  onUpdate?: () => Promise<void>;
}

function toStepDetails(
  code: CrawlerCurrentStep["code"],
  metadata: CrawlerStepMetadata = {},
): CrawlerRunStepDetails {
  switch (code) {
    case "moneyforward_refresh":
      return {
        step: code,
        metadata: {
          kind: "refresh",
          maxWaitMinutes: Number(metadata.maxWaitMinutes ?? 0),
          remainingAccounts: Number(metadata.remainingCount ?? 0),
          incompleteAccounts: Array.isArray(metadata.incompleteAccounts)
            ? metadata.incompleteAccounts
            : [],
        },
      };
    case "group_data":
      return {
        step: code,
        metadata: { kind: "group", groupName: String(metadata.groupName ?? "") },
      };
    case "cash_flow_history":
      return {
        step: code,
        metadata: { kind: "month", month: String(metadata.month ?? "") },
      };
    default:
      return { step: code, metadata: null };
  }
}

function toCurrent(item: CrawlerRunTimelineItem): CrawlerRunCurrent {
  return {
    timelineItemId: item.id,
    label: item.label,
    step: item.step,
    metadata: item.metadata,
  } as CrawlerRunCurrent;
}

function progressFor(timeline: CrawlerRunTimelineItem[]) {
  return {
    completed: timeline.filter(({ status }) =>
      ["done", "warning", "failed", "skipped"].includes(status),
    ).length,
    total: timeline.length,
  };
}

function runningProgressFor(timeline: CrawlerRunTimelineItem[]) {
  const { completed } = progressFor(timeline);
  return {
    completed,
    total: Math.max(BASELINE_STEP_COUNT, timeline.length, completed + 1),
  };
}

export async function createCrawlerProgressReporter(
  statePath: string,
  run: { id: string; source: string; startedAt: string },
  reporterOptions: CrawlerProgressReporterOptions = {},
): Promise<CrawlerProgressReporter> {
  let state: CrawlerRunStateSnapshot = {
    version: 1,
    runId: run.id,
    source: run.source,
    startedAt: run.startedAt,
    finishedAt: null,
    runStatus: "running",
    current: null,
    progress: runningProgressFor([]),
    reason: null,
    timeline: [],
  };
  const options = { statePath: statePath || getCrawlerRunStatePath() };
  await writeCrawlerRunState(state, options);
  await reporterOptions.onUpdate?.();

  async function update(mutator: (draft: CrawlerRunStateSnapshot) => void): Promise<void> {
    const draft = structuredClone(state);
    mutator(draft);
    await writeCrawlerRunState(draft, options);
    await reporterOptions.onUpdate?.();
    state = draft;
  }

  function findStep(draft: CrawlerRunStateSnapshot, stepId: string): CrawlerRunTimelineItem {
    const step = draft.timeline.find((candidate) => candidate.id === stepId);
    if (!step) throw new Error(`Unknown crawler progress step: ${stepId}`);
    return step;
  }

  function updateStepMetadata(
    item: CrawlerRunTimelineItem,
    metadata: CrawlerStepMetadata | undefined,
  ): void {
    if (!metadata) return;
    let currentMetadata: CrawlerStepMetadata = {};
    if (item.metadata?.kind === "refresh") {
      currentMetadata = {
        maxWaitMinutes: item.metadata.maxWaitMinutes,
        remainingCount: item.metadata.remainingAccounts,
        incompleteAccounts: item.metadata.incompleteAccounts,
      };
    } else if (item.metadata?.kind === "group") {
      currentMetadata = { groupName: item.metadata.groupName };
    } else if (item.metadata?.kind === "month") {
      currentMetadata = { month: item.metadata.month };
    }
    Object.assign(item, toStepDetails(item.step, { ...currentMetadata, ...metadata }));
  }

  function restoreRunningCurrent(draft: CrawlerRunStateSnapshot): void {
    const runningStep = draft.timeline.findLast(({ status }) => status === "running");
    draft.current = runningStep ? toCurrent(runningStep) : null;
  }

  return {
    getState: () => structuredClone(state),
    startStep: async (step, metadata) => {
      const id = randomUUID();
      await update((draft) => {
        const item: CrawlerRunTimelineItem = {
          id,
          label: step.label,
          ...toStepDetails(step.code, metadata),
          status: "running",
          startedAt: new Date().toISOString(),
          finishedAt: null,
          reason: null,
        };
        draft.current = toCurrent(item);
        draft.timeline.push(item);
        draft.progress = runningProgressFor(draft.timeline);
      });
      return id;
    },
    updateStep: async (stepId, metadata) => {
      await update((draft) => {
        const step = findStep(draft, stepId);
        updateStepMetadata(step, metadata);
        draft.current = toCurrent(step);
        draft.progress = runningProgressFor(draft.timeline);
      });
    },
    completeStep: async (stepId, metadata) => {
      await update((draft) => {
        const step = findStep(draft, stepId);
        updateStepMetadata(step, metadata);
        Object.assign(step, {
          status: "done",
          finishedAt: new Date().toISOString(),
          reason: null,
        });
        restoreRunningCurrent(draft);
        draft.progress = runningProgressFor(draft.timeline);
      });
    },
    skipStep: async (stepId) => {
      await update((draft) => {
        const step = findStep(draft, stepId);
        Object.assign(step, {
          status: "skipped",
          startedAt: null,
          finishedAt: new Date().toISOString(),
          reason: null,
        });
        restoreRunningCurrent(draft);
        draft.progress = runningProgressFor(draft.timeline);
      });
    },
    warnStep: async (stepId, reason, metadata) => {
      await update((draft) => {
        const step = findStep(draft, stepId);
        updateStepMetadata(step, metadata);
        Object.assign(step, { status: "warning", finishedAt: new Date().toISOString(), reason });
        restoreRunningCurrent(draft);
        draft.progress = runningProgressFor(draft.timeline);
      });
    },
    failStep: async (stepId, reason) => {
      await update((draft) => {
        const step = findStep(draft, stepId);
        Object.assign(step, { status: "failed", finishedAt: new Date().toISOString(), reason });
        draft.current = toCurrent(step);
        draft.progress = runningProgressFor(draft.timeline);
      });
    },
    finish: async (status, reason) => {
      await update((draft) => {
        Object.assign(draft, {
          runStatus: status,
          finishedAt: new Date().toISOString(),
          progress: progressFor(draft.timeline),
        });
        if (status === "success") {
          draft.current = null;
          draft.reason = null;
        } else {
          const failedStep = draft.timeline.findLast(
            ({ status: stepStatus }) => stepStatus === "failed",
          );
          draft.reason = reason ??
            failedStep?.reason ?? { code: "unknown_error", message: "処理に失敗しました" };
        }
      });
    },
  };
}

export function normalizeCrawlerError(error: unknown, fallbackCode: string): CrawlerReason {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (fallbackCode === "auth_failed") {
    return { code: "auth_failed", message: "MoneyForward の認証に失敗しました" };
  }
  if (name === "TimeoutError" || /timeout|timed out/i.test(message)) {
    const timeoutMs = Number(message.match(/(\d+)\s*ms/i)?.[1] ?? 0);
    const operationLabels: Record<string, string> = {
      database_save: "データベース保存",
      notification_failed: "更新結果の通知",
      web_cache_refresh_failed: "Webキャッシュ更新",
    };
    const operationLabel = operationLabels[fallbackCode];
    if (operationLabel) {
      return { code: "unknown_error", message: `${operationLabel}がタイムアウトしました` };
    }
    return {
      code: "moneyforward_timeout",
      message: "画面の応答待ちがタイムアウトしました",
      operation: "MoneyForward画面の応答待ち",
      timeoutMs,
    };
  }
  if (/net::ERR_|page\.goto|navigation/i.test(message)) {
    return {
      code: "navigation_failed",
      message: "MoneyForward の画面遷移に失敗しました",
      url: "MoneyForward画面",
    };
  }
  if (/selector|locator|waiting for .* to be|not found|no element/i.test(message)) {
    return {
      code: "selector_not_found",
      message: "必要な画面要素を確認できませんでした",
      selector: "MoneyForward画面の操作対象",
    };
  }
  return { code: "unknown_error", message: "処理中にエラーが発生しました" };
}

export async function runCrawlerStep<T>(
  reporter: CrawlerProgressReporter,
  step: CrawlerCurrentStep,
  task: () => Promise<T>,
  options: { metadata?: CrawlerStepMetadata; failureCode?: string } = {},
): Promise<T> {
  const stepId = await reporter.startStep(step, options.metadata);
  try {
    const result = await task();
    await reporter.completeStep(stepId);
    return result;
  } catch (error) {
    await reporter.failStep(stepId, normalizeCrawlerError(error, options.failureCode ?? step.code));
    throw error;
  }
}
