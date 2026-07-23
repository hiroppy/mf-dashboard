import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_CRAWLER_STATE_PATH = path.resolve(
  import.meta.dirname,
  "../../../data/crawler-run.lock.state",
);

export type CrawlerRunStatus = "running" | "success" | "failed";
export type CrawlerStepStatus = "running" | "success" | "warning" | "failed";
export type CrawlerStepCode =
  | "authentication"
  | "refresh"
  | "global_data"
  | "group_data"
  | "monthly_cash_flow"
  | "database_save"
  | "institution_categories"
  | "analytics"
  | "notification"
  | "web_cache_refresh";

export type CrawlerStepMetadata = Record<string, string | number | string[]>;

export interface CrawlerReason {
  code: string;
  message: string;
}

export interface CrawlerCurrentStep {
  code: CrawlerStepCode;
  label: string;
  metadata?: CrawlerStepMetadata;
}

export interface CrawlerTimelineStep extends CrawlerCurrentStep {
  id: string;
  status: CrawlerStepStatus;
  startedAt: string;
  finishedAt: string | null;
  reason?: CrawlerReason;
}

export interface CrawlerProgressState {
  runId: string;
  running: boolean;
  pid: number;
  source: string;
  startedAt: string;
  finishedAt: string | null;
  runStatus: CrawlerRunStatus;
  current: CrawlerCurrentStep | null;
  waitingFor: string | null;
  reason: CrawlerReason | null;
  timeline: CrawlerTimelineStep[];
}

export const CRAWLER_STEPS = {
  authentication: { code: "authentication", label: "MoneyForward に認証" },
  refresh: { code: "refresh", label: "金融機関データを一括更新" },
  globalData: { code: "global_data", label: "全体データを取得" },
  groupData: { code: "group_data", label: "グループデータを取得" },
  monthlyCashFlow: { code: "monthly_cash_flow", label: "月次入出金を取得" },
  databaseSave: { code: "database_save", label: "データベースに保存" },
  institutionCategories: {
    code: "institution_categories",
    label: "金融機関カテゴリを更新",
  },
  analytics: { code: "analytics", label: "金融データを分析" },
  notification: { code: "notification", label: "更新結果を通知" },
  webCacheRefresh: { code: "web_cache_refresh", label: "Web キャッシュを更新" },
} as const satisfies Record<string, CrawlerCurrentStep>;

export interface CrawlerProgressReporter {
  getState: () => CrawlerProgressState;
  startStep: (step: CrawlerCurrentStep, metadata?: CrawlerStepMetadata) => Promise<string>;
  updateWaiting: (
    stepId: string,
    waitingFor: string,
    metadata?: CrawlerStepMetadata,
  ) => Promise<void>;
  completeStep: (stepId: string, metadata?: CrawlerStepMetadata) => Promise<void>;
  warnStep: (
    stepId: string,
    reason: CrawlerReason,
    metadata?: CrawlerStepMetadata,
  ) => Promise<void>;
  failStep: (stepId: string, reason: CrawlerReason) => Promise<void>;
  finish: (status: Exclude<CrawlerRunStatus, "running">, reason?: CrawlerReason) => Promise<void>;
}

function mergeMetadata(
  current: CrawlerStepMetadata | undefined,
  update: CrawlerStepMetadata | undefined,
): CrawlerStepMetadata | undefined {
  if (!current && !update) return undefined;
  return { ...current, ...update };
}

async function writeState(statePath: string, state: CrawlerProgressState): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(state));
  await rename(temporaryPath, statePath);
}

export async function readCrawlerProgressState(
  statePath: string,
): Promise<CrawlerProgressState | null> {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8")) as Partial<CrawlerProgressState>;
    if (
      typeof parsed.runId !== "string" ||
      typeof parsed.running !== "boolean" ||
      typeof parsed.pid !== "number" ||
      typeof parsed.source !== "string" ||
      typeof parsed.startedAt !== "string" ||
      !Array.isArray(parsed.timeline)
    ) {
      return null;
    }
    return parsed as CrawlerProgressState;
  } catch {
    return null;
  }
}

export async function createCrawlerProgressReporter(
  statePath: string,
  run: { id: string; pid: number; source: string; startedAt: string },
): Promise<CrawlerProgressReporter> {
  let state: CrawlerProgressState = {
    runId: run.id,
    running: true,
    pid: run.pid,
    source: run.source,
    startedAt: run.startedAt,
    finishedAt: null,
    runStatus: "running",
    current: null,
    waitingFor: null,
    reason: null,
    timeline: [],
  };
  await writeState(statePath, state);

  async function update(mutator: (draft: CrawlerProgressState) => void): Promise<void> {
    const draft = structuredClone(state);
    mutator(draft);
    state = draft;
    await writeState(statePath, state);
  }

  function findStep(draft: CrawlerProgressState, stepId: string): CrawlerTimelineStep {
    const step = draft.timeline.find((candidate) => candidate.id === stepId);
    if (!step) throw new Error(`Unknown crawler progress step: ${stepId}`);
    return step;
  }

  return {
    getState: () => structuredClone(state),
    startStep: async (step, metadata) => {
      const id = randomUUID();
      await update((draft) => {
        const current = { ...step, ...(metadata ? { metadata } : {}) };
        draft.current = current;
        draft.waitingFor = null;
        draft.reason = null;
        draft.timeline.push({
          ...current,
          id,
          status: "running",
          startedAt: new Date().toISOString(),
          finishedAt: null,
        });
      });
      return id;
    },
    updateWaiting: async (stepId, waitingFor, metadata) => {
      await update((draft) => {
        const step = findStep(draft, stepId);
        step.metadata = mergeMetadata(step.metadata, metadata);
        draft.current = { code: step.code, label: step.label, metadata: step.metadata };
        draft.waitingFor = waitingFor;
      });
    },
    completeStep: async (stepId, metadata) => {
      await update((draft) => {
        const step = findStep(draft, stepId);
        step.status = "success";
        step.finishedAt = new Date().toISOString();
        step.metadata = mergeMetadata(step.metadata, metadata);
        draft.current = null;
        draft.waitingFor = null;
        draft.reason = null;
      });
    },
    warnStep: async (stepId, reason, metadata) => {
      await update((draft) => {
        const step = findStep(draft, stepId);
        step.status = "warning";
        step.finishedAt = new Date().toISOString();
        step.reason = reason;
        step.metadata = mergeMetadata(step.metadata, metadata);
        draft.current = null;
        draft.waitingFor = null;
        draft.reason = reason;
      });
    },
    failStep: async (stepId, reason) => {
      await update((draft) => {
        const step = findStep(draft, stepId);
        step.status = "failed";
        step.finishedAt = new Date().toISOString();
        step.reason = reason;
        draft.current = { code: step.code, label: step.label, metadata: step.metadata };
        draft.waitingFor = null;
        draft.reason = reason;
      });
    },
    finish: async (status, reason) => {
      await update((draft) => {
        draft.running = false;
        draft.runStatus = status;
        draft.finishedAt = new Date().toISOString();
        if (status === "success") draft.current = null;
        draft.waitingFor = null;
        if (reason) draft.reason = reason;
      });
    },
  };
}

export function normalizeCrawlerError(error: unknown, fallbackCode: string): CrawlerReason {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "TimeoutError" || /timeout|timed out/i.test(message)) {
    return { code: "playwright_timeout", message: "画面の応答待ちがタイムアウトしました" };
  }
  if (/selector|locator|waiting for .* to be|not found|no element/i.test(message)) {
    return { code: "selector_not_found", message: "必要な画面要素を確認できませんでした" };
  }
  return { code: fallbackCode, message: "処理中にエラーが発生しました" };
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
