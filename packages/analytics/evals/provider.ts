import { resolve } from "node:path";
import { getCurrentGroup, getDb, isDatabaseAvailable } from "@mf-dashboard/db";
import { generateText, stepCountIs } from "ai";
import MockDate from "mockdate";
import { FINANCE_CHAT_MAX_TOOL_STEPS, getFinanceChatSystemPrompt } from "../src/chat/prompt";
import { createFinanceChatTools } from "../src/chat/tools";
import { getModel, isLLMEnabled } from "../src/config";

interface ProviderOptions {
  id?: string;
}

interface CallContext {
  vars?: Record<string, unknown>;
}

interface ChatResponse {
  text: string;
  steps: Array<{
    toolResults: Array<{ toolName: string; output: unknown }>;
  }>;
}

interface ProviderDependencies {
  getDatabasePath: () => string | undefined;
  generate: (options: Parameters<typeof generateText>[0]) => Promise<ChatResponse>;
  getCurrentGroup: typeof getCurrentGroup;
  getDb: typeof getDb;
  getModel: typeof getModel;
  isDatabaseAvailable: typeof isDatabaseAvailable;
  isLLMEnabled: typeof isLLMEnabled;
}

const defaultDependencies: ProviderDependencies = {
  getDatabasePath: () => process.env.DB_PATH,
  generate: generateText as ProviderDependencies["generate"],
  getCurrentGroup,
  getDb,
  getModel,
  isDatabaseAvailable,
  isLLMEnabled,
};

const DEMO_DB_PATH = resolve(import.meta.dirname, "../../../data/demo.db");

export function toEvaluationOutput(response: ChatResponse) {
  const presentations = response.steps.flatMap(({ toolResults }) =>
    toolResults.flatMap(({ toolName, output }) =>
      toolName === "presentFinanceCards" && Array.isArray(output) ? [output] : [],
    ),
  );
  if (presentations.length !== 1) {
    throw new Error(
      `presentFinanceCards の成功結果は1件必要です（実際: ${presentations.length}件）。`,
    );
  }

  return {
    text: response.text,
    cards: presentations[0],
  };
}

export default class FinanceChatProvider {
  private readonly providerId: string;

  constructor(
    options: ProviderOptions = {},
    private readonly dependencies: ProviderDependencies = defaultDependencies,
  ) {
    this.providerId = options.id ?? "mf-dashboard-finance-chat";
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt: string, context: CallContext = {}) {
    try {
      if (!this.dependencies.isLLMEnabled()) {
        throw new Error("AI_PROVIDER、AI_MODEL、AI_API_KEY を設定してください。");
      }
      const databasePath = this.dependencies.getDatabasePath();
      if (!databasePath || resolve(process.cwd(), databasePath) !== DEMO_DB_PATH) {
        throw new Error("評価にはリポジトリの data/demo.db を DB_PATH に指定してください。");
      }
      if (!this.dependencies.isDatabaseAvailable()) {
        throw new Error(
          "demo.db がありません。先に pnpm --filter @mf-dashboard/db build:demo を実行してください。",
        );
      }

      const evaluationDateValue = context.vars?.evaluationDate;
      if (typeof evaluationDateValue !== "string") {
        throw new Error("evaluationDate を ISO 8601 形式で指定してください。");
      }
      const evaluationDate = new Date(evaluationDateValue);
      if (Number.isNaN(evaluationDate.getTime())) {
        throw new Error("evaluationDate を ISO 8601 形式で指定してください。");
      }

      const db = this.dependencies.getDb();
      const group = await this.dependencies.getCurrentGroup(db);
      if (!group) throw new Error("demo.db に current group がありません。");

      MockDate.set(evaluationDate);
      let response: ChatResponse;
      try {
        response = await this.dependencies.generate({
          model: this.dependencies.getModel(),
          system: getFinanceChatSystemPrompt(evaluationDate),
          prompt,
          tools: createFinanceChatTools(db, group.id),
          stopWhen: stepCountIs(FINANCE_CHAT_MAX_TOOL_STEPS),
        });
      } finally {
        MockDate.reset();
      }

      return { output: JSON.stringify(toEvaluationOutput(response)) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}
