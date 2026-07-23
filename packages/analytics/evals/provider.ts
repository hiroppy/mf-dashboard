import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { getCurrentGroup, getDb, isDatabaseAvailable } from "@mf-dashboard/db";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { financeChatCardsSchema } from "../src/chat/cards";
import { FINANCE_CHAT_MAX_TOOL_STEPS, getFinanceChatSystemPrompt } from "../src/chat/prompt";
import { createFinanceChatTools } from "../src/chat/tools";
import { getModel, isLLMEnabled } from "../src/config";

interface ToolResult {
  toolName: string;
  output: unknown;
}

export interface ChatResponse {
  text: string;
  steps: Array<{ toolResults: ToolResult[] }>;
}

interface CallContext {
  vars?: Record<string, unknown>;
}

interface ProviderOptions {
  id?: string;
}

export interface ProviderDependencies {
  generate: (options: Parameters<typeof generateText>[0]) => Promise<ChatResponse>;
  getCurrentGroup: typeof getCurrentGroup;
  getDatabasePath: () => string | undefined;
  getDb: typeof getDb;
  getModel: typeof getModel;
  isDatabaseAvailable: typeof isDatabaseAvailable;
  isLLMEnabled: typeof isLLMEnabled;
}

const dependencies: ProviderDependencies = {
  generate: generateText as ProviderDependencies["generate"],
  getCurrentGroup,
  getDatabasePath: () => process.env.DB_PATH,
  getDb,
  getModel,
  isDatabaseAvailable,
  isLLMEnabled,
};

const DEMO_DB_PATH = resolve(import.meta.dirname, "../../../data/demo.db");
const evaluationDateSchema = z.iso.datetime({ offset: true });

function collectHrefs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectHrefs);
  if (typeof value !== "object" || value === null) return [];

  return Object.entries(value).flatMap(([key, field]) => {
    if (key === "href" && typeof field === "string") return [field];
    return collectHrefs(field);
  });
}

export function toEvaluationOutput(response: ChatResponse) {
  const presentations: unknown[] = [];
  const routes: string[] = [];

  for (const step of response.steps) {
    for (const result of step.toolResults) {
      if (result.toolName === "presentFinanceCards") {
        presentations.push(result.output);
      }
      if (
        result.toolName === "getFinanceDashboardRoute" &&
        typeof result.output === "object" &&
        result.output !== null &&
        "href" in result.output &&
        typeof result.output.href === "string"
      ) {
        routes.push(result.output.href);
      }
    }
  }

  if (presentations.length !== 1) {
    throw new Error(
      `presentFinanceCards の成功結果は1件必要です（実際: ${presentations.length}件）。`,
    );
  }

  const cards = financeChatCardsSchema.parse(presentations[0]);
  return {
    text: response.text,
    cards,
    routes: [...new Set([...routes, ...collectHrefs(cards)])],
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

      const response = await this.providerDependencies.generate({
        model: this.providerDependencies.getModel(),
        system: getFinanceChatSystemPrompt(evaluationDate),
        prompt,
        tools: createFinanceChatTools(db, group.id),
        stopWhen: stepCountIs(FINANCE_CHAT_MAX_TOOL_STEPS),
      });

      return { output: JSON.stringify(toEvaluationOutput(response)) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private validateEnvironment() {
    if (!this.providerDependencies.isLLMEnabled()) {
      throw new Error("AI_PROVIDER、AI_MODEL、AI_API_KEY を設定してください。");
    }

    const databasePath = this.providerDependencies.getDatabasePath();
    const resolvedDatabasePath = databasePath && resolve(process.cwd(), databasePath);
    if (resolvedDatabasePath !== DEMO_DB_PATH) {
      throw new Error("評価にはリポジトリの data/demo.db を DB_PATH に指定してください。");
    }
    if (!this.providerDependencies.isDatabaseAvailable() || !existsSync(DEMO_DB_PATH)) {
      throw new Error(
        "demo.db がありません。先に pnpm --filter @mf-dashboard/db build:demo --period=2026-07 を実行してください。",
      );
    }
    if (realpathSync(resolvedDatabasePath) !== realpathSync(DEMO_DB_PATH)) {
      throw new Error("評価にはリポジトリの data/demo.db を DB_PATH に指定してください。");
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
