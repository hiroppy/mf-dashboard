import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  toolCallId: string;
  toolName: string;
  output: unknown;
}

interface ToolCall {
  input: unknown;
  toolCallId: string;
  toolName: string;
}

export interface ChatResponse {
  text: string;
  steps: ReadonlyArray<{
    toolCalls: ReadonlyArray<ToolCall>;
    toolResults: ReadonlyArray<ToolResult>;
  }>;
}

interface ToolTraceEntry {
  input: unknown;
  output?: unknown;
  succeeded: boolean;
  toolName: string;
}

export interface EvaluationOutput {
  text: string;
  charts: FinanceChart[];
  renderedLinks: string[];
  toolTrace: ToolTraceEntry[];
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
  canonicalizeDatabasePath: (path: string) => string;
  closeDb: () => void;
  getDemoDatabasePath: () => string;
  generate: (options: GenerateOptions) => Promise<ChatResponse>;
  getCurrentGroup: (db: Db) => Promise<{ id: string } | undefined>;
  getDatabasePath: () => string | undefined;
  getDb: () => Db;
  getModel: typeof getModel;
  isDatabaseAvailable: (path: string) => boolean;
  isLLMEnabled: typeof isLLMEnabled;
}

const defaultDependencies: ProviderDependencies = {
  canonicalizeDatabasePath: realpathSync,
  closeDb,
  getDemoDatabasePath: () => fileURLToPath(new URL("../../../data/demo.db", import.meta.url)),
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

function getRenderedLinks(text: string): string[] {
  const markdownLinks = [...text.matchAll(/\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(
    (match) => match[1]!,
  );
  const htmlLinks = [...text.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map(
    (match) => match[1]!,
  );

  return unique([...markdownLinks, ...htmlLinks]);
}

function getTextLinks(text: string): string[] {
  const rawLinks = [...text.matchAll(/(?:https?:)?\/\/[^\s<>)"']+/g)].map((match) =>
    match[0].replace(/[.,。、!?！？]+$/, ""),
  );
  const routeText = text.replace(/<[^>]*>/g, "");
  const routeCandidates = [
    ...routeText.matchAll(/(?<![A-Za-z0-9%._~:/-])\/[A-Za-z0-9%._~-]+(?:\/[A-Za-z0-9%._~-]+)*/g),
  ].map((match) => match[0]);

  return unique([...getRenderedLinks(text), ...rawLinks, ...routeCandidates]);
}

export function toEvaluationOutput(response: ChatResponse): EvaluationOutput {
  const toolResults = response.steps.flatMap((step) => step.toolResults);
  const toolTrace = response.steps.flatMap((step) =>
    step.toolCalls.map((call) => {
      const result = step.toolResults.find(({ toolCallId }) => toolCallId === call.toolCallId);
      return {
        input: call.input,
        output: result?.output,
        succeeded: result !== undefined,
        toolName: call.toolName,
      };
    }),
  );
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
    renderedLinks: getRenderedLinks(response.text),
    toolTrace,
    toolRoutes: unique(toolRoutes),
    textLinks: getTextLinks(response.text),
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
      const canonicalDatabasePath = this.dependencies.canonicalizeDatabasePath(databasePath);
      const canonicalDemoDatabasePath = this.dependencies.canonicalizeDatabasePath(
        this.dependencies.getDemoDatabasePath(),
      );
      if (canonicalDatabasePath !== canonicalDemoDatabasePath) {
        return { error: "評価では匿名化されたdata/demo.dbのみ使用できます。" };
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
