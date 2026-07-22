import { lstatSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { getCurrentGroup, getDb, isDatabaseAvailable, searchTransactions } from "@mf-dashboard/db";
import { generateText, stepCountIs } from "ai";
import MockDate from "mockdate";
import { z } from "zod";
import { buildFinanceChatHref, financeChatHrefSchema } from "../src/chat/cards";
import { sanitizeFinanceChatLinks } from "../src/chat/link-sanitizer";
import { FINANCE_CHAT_MAX_TOOL_STEPS, getFinanceChatSystemPrompt } from "../src/chat/prompt";
import { createFinanceChatTools } from "../src/chat/tools";
import { getModel, isLLMEnabled } from "../src/config";

interface ProviderOptions {
  id?: string;
}

interface CallContext {
  vars?: Record<string, unknown>;
}

export interface ChatResponse {
  text: string;
  steps: Array<{
    text?: string;
    toolResults: Array<{ toolName: string; input?: unknown; output: unknown }>;
  }>;
}

interface DataToolResult {
  toolName: string;
  input: unknown;
  output: unknown;
}

export interface ProviderDependencies {
  generate: (options: Parameters<typeof generateText>[0]) => Promise<ChatResponse>;
  getCurrentGroup: typeof getCurrentGroup;
  getDatabasePath: () => string | undefined;
  getDb: typeof getDb;
  getModel: typeof getModel;
  isDatabaseAvailable: typeof isDatabaseAvailable;
  isDemoDatabasePath: (databasePath: string) => boolean;
  isDemoFixtureDatabase: typeof isDemoFixtureDatabase;
  isLLMEnabled: typeof isLLMEnabled;
}

const dependencies: ProviderDependencies = {
  generate: generateText as ProviderDependencies["generate"],
  getCurrentGroup,
  getDatabasePath: () => process.env.DB_PATH,
  getDb,
  getModel,
  isDatabaseAvailable,
  isDemoDatabasePath,
  isDemoFixtureDatabase,
  isLLMEnabled,
};

const DEMO_DB_PATH = resolve(import.meta.dirname, "../../../data/demo.db");
const evaluationDateSchema = z.iso.datetime({ offset: true });

export function isDemoDatabasePath(databasePath: string) {
  try {
    const resolvedPath = resolve(process.cwd(), databasePath);
    const databaseStat = lstatSync(resolvedPath);
    const demoStat = lstatSync(DEMO_DB_PATH);
    return (
      databaseStat.isFile() &&
      !databaseStat.isSymbolicLink() &&
      databaseStat.nlink === 1 &&
      demoStat.isFile() &&
      !demoStat.isSymbolicLink() &&
      demoStat.nlink === 1 &&
      realpathSync(resolvedPath) === realpathSync(DEMO_DB_PATH)
    );
  } catch {
    return false;
  }
}

async function isDemoFixtureDatabase(db: ReturnType<typeof getDb>) {
  const markers = await searchTransactions(
    {
      groupId: "0",
      date: "2026-07-31",
      category: "食費",
      keyword: "すき家",
      minAmount: 2638,
      maxAmount: 2638,
      type: "expense",
      limit: 10,
    },
    db,
  );
  return markers.some(
    (marker) =>
      marker.mfId === "demo_001281" &&
      marker.date === "2026-07-31" &&
      marker.description === "すき家" &&
      marker.amount === 2638 &&
      marker.category === "食費" &&
      marker.type === "expense",
  );
}

export function toEvaluationOutput(response: ChatResponse, groupId: string) {
  const groupHref = buildFinanceChatHref({ page: "dashboard", groupId });
  const allowedHrefs = new Set<string>();
  let allowedHrefsAtPresentation: string[] = [];
  const dataToolResults: DataToolResult[] = [];
  let dataToolResultsAtPresentation: DataToolResult[] = [];
  const presentations: unknown[] = [];
  const visibleText: string[] = [];
  const textEvidence: Array<{
    text: string;
    allowedHrefs: string[];
    dataToolResults: DataToolResult[];
  }> = [];
  let hasStepText = false;

  for (const step of response.steps) {
    const allowedHrefsBeforeStep = [...allowedHrefs];
    const dataToolResultsBeforeStep = [...dataToolResults];
    if (step.text !== undefined) {
      hasStepText = true;
      const text = sanitizeFinanceChatLinks(step.text, allowedHrefs);
      visibleText.push(text);
      textEvidence.push({
        text,
        allowedHrefs: allowedHrefsBeforeStep,
        dataToolResults: dataToolResultsBeforeStep,
      });
    }

    for (const { toolName, input, output } of step.toolResults) {
      if (toolName !== "getFinanceDashboardRoute" && toolName !== "presentFinanceCards") {
        dataToolResults.push({ toolName, input, output });
      }
      if (toolName === "getFinanceDashboardRoute") {
        const route = financeChatHrefSchema.safeParse(
          typeof output === "object" && output !== null && "href" in output
            ? output.href
            : undefined,
        );
        if (route.success && (route.data === groupHref || route.data.startsWith(`${groupHref}/`))) {
          allowedHrefs.add(route.data);
        }
      }
      if (toolName === "presentFinanceCards") {
        presentations.push(output);
        allowedHrefsAtPresentation = allowedHrefsBeforeStep;
        dataToolResultsAtPresentation = dataToolResultsBeforeStep;
      }
    }
  }

  if (presentations.length !== 1 || !Array.isArray(presentations[0])) {
    throw new Error(
      `presentFinanceCards の成功結果は1件必要です（実際: ${presentations.length}件）。`,
    );
  }

  const text = hasStepText
    ? visibleText.join("")
    : sanitizeFinanceChatLinks(response.text, allowedHrefs);
  return {
    allowedHrefs: allowedHrefsAtPresentation,
    dataToolResults: dataToolResultsAtPresentation,
    text,
    textEvidence: hasStepText
      ? textEvidence
      : [
          {
            text,
            allowedHrefs: allowedHrefsAtPresentation,
            dataToolResults: dataToolResultsAtPresentation,
          },
        ],
    cards: presentations[0],
  };
}

export default class FinanceChatProvider {
  private readonly providerId: string;

  constructor(
    options: ProviderOptions = {},
    private readonly providerDependencies: ProviderDependencies = dependencies,
  ) {
    this.providerId = options.id ?? "mf-dashboard-finance-chat";
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt: string, context: CallContext = {}) {
    try {
      this.validateEnvironment();
      const evaluationDate = this.getEvaluationDate(context);
      const db = this.providerDependencies.getDb();
      const group = await this.providerDependencies.getCurrentGroup(db);
      if (!group) throw new Error("demo.db に current group がありません。");
      if (
        group.id !== "0" ||
        group.name !== "グループ選択なし" ||
        !group.isCurrent ||
        !(await this.providerDependencies.isDemoFixtureDatabase(db))
      ) {
        throw new Error(
          "demo.db の内容が評価fixtureと一致しません。pnpm --filter @mf-dashboard/db build:demo --period=2026-07 で再生成してください。",
        );
      }

      MockDate.set(evaluationDate);
      let response: ChatResponse;
      try {
        response = await this.providerDependencies.generate({
          model: this.providerDependencies.getModel(),
          system: getFinanceChatSystemPrompt(evaluationDate),
          prompt,
          tools: createFinanceChatTools(db, group.id),
          stopWhen: stepCountIs(FINANCE_CHAT_MAX_TOOL_STEPS),
        });
      } finally {
        MockDate.reset();
      }

      return { output: JSON.stringify(toEvaluationOutput(response, group.id)) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private validateEnvironment() {
    if (!this.providerDependencies.isLLMEnabled()) {
      throw new Error("AI_PROVIDER、AI_MODEL、AI_API_KEY を設定してください。");
    }

    const databasePath = this.providerDependencies.getDatabasePath();
    if (!databasePath || resolve(process.cwd(), databasePath) !== DEMO_DB_PATH) {
      throw new Error("評価にはリポジトリの data/demo.db を DB_PATH に指定してください。");
    }
    if (!this.providerDependencies.isDatabaseAvailable()) {
      throw new Error(
        "demo.db がありません。先に pnpm --filter @mf-dashboard/db build:demo を実行してください。",
      );
    }
    if (!this.providerDependencies.isDemoDatabasePath(databasePath)) {
      throw new Error("評価には通常ファイルの data/demo.db を DB_PATH に指定してください。");
    }
  }

  private getEvaluationDate(context: CallContext) {
    const value = context.vars?.evaluationDate;
    const result = evaluationDateSchema.safeParse(value);
    if (!result.success) {
      throw new Error("evaluationDate を ISO 8601 形式で指定してください。");
    }
    return new Date(result.data);
  }
}
