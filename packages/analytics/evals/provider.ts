import { existsSync } from "node:fs";
import { closeDb, getCurrentGroup, getDb, type Db } from "@mf-dashboard/db";
import { generateText, stepCountIs } from "ai";
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from "promptfoo";
import { financeChartSchema, type FinanceChart } from "../src/chat/chart";
import { financeChatHrefSchema } from "../src/chat/navigation-tool";
import {
  FINANCE_CHAT_MAX_GENERATION_STEPS,
  FINANCE_CHAT_MAX_OUTPUT_TOKENS,
  getFinanceChatSystemPrompt,
} from "../src/chat/prompt";
import { createFinanceChatTools } from "../src/chat/tools";
import { getModel, isLLMEnabled } from "../src/config";

interface ToolResult {
  toolName: string;
  output: unknown;
}

export interface ChatResponse {
  text: string;
  steps: ReadonlyArray<{
    toolResults: ReadonlyArray<ToolResult>;
  }>;
}

export interface EvaluationOutput {
  text: string;
  charts: FinanceChart[];
  toolRoutes: string[];
  textLinks: string[];
}

interface GenerateOptions {
  maxOutputTokens: number;
  model: ReturnType<typeof getModel>;
  prepareStep: (options: { stepNumber: number }) => { toolChoice: "none" } | undefined;
  prompt: string;
  stopWhen: ReturnType<typeof stepCountIs>;
  system: string;
  tools: ReturnType<typeof createFinanceChatTools>;
}

export interface ProviderDependencies {
  closeDb: () => void;
  generate: (options: GenerateOptions) => Promise<ChatResponse>;
  getCurrentGroup: (db: Db) => Promise<{ id: string } | undefined>;
  getDatabasePath: () => string | undefined;
  getDb: () => Db;
  getModel: typeof getModel;
  isDatabaseAvailable: (path: string) => boolean;
  isLLMEnabled: typeof isLLMEnabled;
}

const defaultDependencies: ProviderDependencies = {
  closeDb,
  generate: async (options) => (await generateText(options)) as ChatResponse,
  getCurrentGroup,
  getDatabasePath: () => process.env.DB_PATH,
  getDb,
  getModel,
  isDatabaseAvailable: existsSync,
  isLLMEnabled,
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function getMarkdownLinks(text: string): string[] {
  return unique(
    [...text.matchAll(/\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]!),
  );
}

export function toEvaluationOutput(response: ChatResponse): EvaluationOutput {
  const toolResults = response.steps.flatMap((step) => step.toolResults);
  const charts = toolResults.flatMap((result) => {
    if (result.toolName !== "presentChart") return [];
    const chart = financeChartSchema.safeParse(result.output);
    return chart.success ? [chart.data] : [];
  });
  const toolRoutes = toolResults.flatMap((result) => {
    if (result.toolName !== "getFinanceDashboardRoute") return [];
    const href =
      typeof result.output === "object" && result.output !== null && "href" in result.output
        ? result.output.href
        : undefined;
    const route = financeChatHrefSchema.safeParse(href);
    return route.success ? [route.data] : [];
  });

  return {
    text: response.text,
    charts,
    toolRoutes: unique(toolRoutes),
    textLinks: getMarkdownLinks(response.text),
  };
}

function getEvaluationDate(value: unknown): Date {
  if (typeof value !== "string") {
    throw new Error("evaluationDate はISO 8601文字列で指定してください。");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("evaluationDate が有効な日時ではありません。");
  }
  return date;
}

export default class FinanceChatProvider implements ApiProvider {
  readonly config: Record<string, unknown>;
  private readonly providerId: string;

  constructor(
    options: ProviderOptions = {},
    private readonly dependencies: ProviderDependencies = defaultDependencies,
  ) {
    this.providerId = options.id ?? "finance-chat";
    this.config = options.config ?? {};
  }

  id(): string {
    return this.providerId;
  }

  cleanup(): void {
    this.dependencies.closeDb();
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    try {
      const databasePath = this.dependencies.getDatabasePath();
      if (!databasePath || !this.dependencies.isDatabaseAvailable(databasePath)) {
        return {
          error:
            "評価用demo.dbがありません。`pnpm --filter @mf-dashboard/db build:demo`を実行してください。",
        };
      }
      if (!this.dependencies.isLLMEnabled()) {
        return { error: "AI_PROVIDER、AI_MODEL、AI_API_KEYを設定してください。" };
      }

      const db = this.dependencies.getDb();
      const group = await this.dependencies.getCurrentGroup(db);
      if (!group) return { error: "評価用demo.dbに現在のグループがありません。" };

      const evaluationDate = getEvaluationDate(context?.vars.evaluationDate);
      const response = await this.dependencies.generate({
        maxOutputTokens: FINANCE_CHAT_MAX_OUTPUT_TOKENS,
        model: this.dependencies.getModel(),
        prepareStep: ({ stepNumber }) =>
          stepNumber === FINANCE_CHAT_MAX_GENERATION_STEPS - 1 ? { toolChoice: "none" } : undefined,
        prompt,
        stopWhen: stepCountIs(FINANCE_CHAT_MAX_GENERATION_STEPS),
        system: getFinanceChatSystemPrompt(evaluationDate),
        tools: createFinanceChatTools(db, group.id),
      });

      return { output: JSON.stringify(toEvaluationOutput(response)) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "評価の実行に失敗しました。" };
    }
  }
}
