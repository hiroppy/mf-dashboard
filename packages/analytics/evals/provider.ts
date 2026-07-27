import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closeDb, getCurrentGroup, getDb, type Db } from "@mf-dashboard/db";
import { executeReadOnlyQuery } from "@mf-dashboard/db/queries/read-only-query";
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
  FINANCE_CHAT_REQUEST_TIMEOUT_MS,
  getFinanceChatSystemPrompt,
} from "../src/chat/prompt";
import { createFinanceChatTools } from "../src/chat/tools";
import { getModel, isLLMEnabled } from "../src/config";
import {
  getMarkdownReferenceDefinitions,
  getRenderableMarkdownLines,
  isEscapedMarkdownMarker,
  normalizeReferenceLabel,
  removeInlineCodeSpans,
  removeMarkdownImages,
} from "./markdown";

interface GeneratedResponse {
  text: string;
  steps: ReadonlyArray<{
    text: string;
    toolCalls: ReadonlyArray<{
      input: unknown;
      toolCallId: string;
      toolName: string;
    }>;
    toolResults: ReadonlyArray<{
      output: unknown;
      toolCallId: string;
      toolName: string;
    }>;
  }>;
}

interface GenerateOptions {
  abortSignal: AbortSignal;
  maxOutputTokens: number;
  model: ReturnType<typeof getModel>;
  prepareStep: (options: { stepNumber: number }) => { toolChoice: "none" } | undefined;
  prompt: string;
  stopWhen: ReturnType<typeof stepCountIs>;
  system: string;
  timeout: { totalMs: number };
  tools: ReturnType<typeof createFinanceChatTools>;
}

export interface EvaluationOutput {
  text: string;
  charts: FinanceChart[];
  databaseQueries: Array<{ input: unknown; output: unknown }>;
  fixtureResult: unknown;
  toolRoutes: string[];
  textLinks: string[];
  textRoutes: string[];
}

export interface ProviderDependencies {
  canonicalizePath: (path: string) => string;
  closeDb: () => void;
  generate: (options: GenerateOptions) => Promise<GeneratedResponse>;
  getCurrentGroup: (db: Db) => Promise<{ id: string } | undefined>;
  getDatabasePath: () => string | undefined;
  getDb: () => Db;
  getDemoDatabasePath: () => string;
  getModel: typeof getModel;
  isFileAvailable: (path: string) => boolean;
  isLLMEnabled: typeof isLLMEnabled;
  queryFixture: (db: Db, sql: string, groupId: string) => Promise<unknown>;
}

const defaultDependencies: ProviderDependencies = {
  canonicalizePath: realpathSync,
  closeDb,
  generate: async (options) => (await generateText(options)) as GeneratedResponse,
  getCurrentGroup,
  getDatabasePath: () => process.env.DB_PATH,
  getDb,
  getDemoDatabasePath: () => fileURLToPath(new URL("../../../data/demo.db", import.meta.url)),
  getModel,
  isFileAvailable: existsSync,
  isLLMEnabled,
  queryFixture: executeReadOnlyQuery,
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function removeNonRenderedText(text: string): string {
  return removeMarkdownImages(text)
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1");
}

function removeCode(text: string): string {
  return removeInlineCodeSpans(getRenderableMarkdownLines(removeNonRenderedText(text)).join("\n"));
}

function normalizeMarkdownDestination(destination: string): string {
  return destination.startsWith("<") && destination.endsWith(">")
    ? destination.slice(1, -1)
    : destination;
}

function getTextLinks(text: string): string[] {
  const renderedText = removeCode(text);
  const markdownLinks = [
    ...renderedText.matchAll(
      /(?<!!)\[[^\]]+]\((<[^>\s]+>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/g,
    ),
  ]
    .filter((match) => !isEscapedMarkdownMarker(renderedText, match.index!))
    .map((match) => normalizeMarkdownDestination(match[1]!));
  const referenceDefinitions = getMarkdownReferenceDefinitions(renderedText);
  const referenceLinks = [...renderedText.matchAll(/(?<!!)\[([^\]]+)]\[([^\]]*)]/g)].flatMap(
    (match) => {
      if (isEscapedMarkdownMarker(renderedText, match.index!)) return [];
      const identifier = match[2] || match[1]!;
      const destination = referenceDefinitions.get(normalizeReferenceLabel(identifier));
      return destination ? [normalizeMarkdownDestination(destination)] : [];
    },
  );
  const shortcutLinks = [...renderedText.matchAll(/(?<!!)\[([^\]]+)](?![[(])/g)].flatMap(
    (match) => {
      if (isEscapedMarkdownMarker(renderedText, match.index!)) return [];
      if (/^\s*:/.test(renderedText.slice(match.index! + match[0].length))) return [];
      const destination = referenceDefinitions.get(normalizeReferenceLabel(match[1]!));
      return destination ? [normalizeMarkdownDestination(destination)] : [];
    },
  );
  const autoLinks = [...renderedText.matchAll(/<(https?:\/\/[^>\s]+)>/g)].map((match) => match[1]!);
  const rawUrls = [...renderedText.matchAll(/https?:\/\/[^\s<>)]+/g)].map((match) =>
    match[0].replace(/[.,。、!?！？]+$/, ""),
  );
  return unique([...markdownLinks, ...referenceLinks, ...shortcutLinks, ...autoLinks, ...rawUrls]);
}

function getTextRoutes(text: string): string[] {
  const renderedText = removeNonRenderedText(text).replace(/^\s*\[[^\]]+]:\s*\S+.*$/gm, "");
  const bareRoutes = [
    ...renderedText.matchAll(/(?<![A-Za-z0-9%._~:/-])\/[A-Za-z0-9%._~-]+(?:\/[A-Za-z0-9%._~-]+)*/g),
  ]
    .map((match) => match[0])
    .filter((route) => financeChatHrefSchema.safeParse(route).success);
  return unique([...getTextLinks(text), ...bareRoutes]).filter(
    (route) => financeChatHrefSchema.safeParse(route).success,
  );
}

export function toEvaluationOutput(
  response: GeneratedResponse,
  fixtureResult: unknown = null,
): EvaluationOutput {
  const stepText = response.steps
    .map((step) => step.text)
    .filter(Boolean)
    .join("\n");
  const text = stepText || response.text;
  const toolResults = response.steps.flatMap((step) => step.toolResults);
  const databaseQueries = response.steps.flatMap((step) =>
    step.toolCalls.flatMap((call) => {
      if (call.toolName !== "queryDatabase") return [];
      const result = step.toolResults.find(
        (candidate) =>
          candidate.toolName === "queryDatabase" && candidate.toolCallId === call.toolCallId,
      );
      return result ? [{ input: call.input, output: result.output }] : [];
    }),
  );
  const charts = toolResults.flatMap((result) => {
    if (result.toolName !== "presentChart") return [];
    const chart = financeChartSchema.safeParse(result.output);
    return chart.success ? [chart.data] : [];
  });
  const toolRoutes = toolResults.flatMap((result) => {
    if (
      result.toolName !== "getFinanceDashboardRoute" ||
      typeof result.output !== "object" ||
      result.output === null ||
      !("href" in result.output)
    ) {
      return [];
    }
    const route = financeChatHrefSchema.safeParse(result.output.href);
    return route.success ? [route.data] : [];
  });

  return {
    text,
    charts,
    databaseQueries,
    fixtureResult,
    toolRoutes: unique(toolRoutes),
    textLinks: getTextLinks(text),
    textRoutes: getTextRoutes(text),
  };
}

function getEvaluationDate(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error("evaluationDate はISO 8601文字列で指定してください。");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
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
      const demoDatabasePath = this.dependencies.getDemoDatabasePath();
      if (
        !databasePath ||
        !this.dependencies.isFileAvailable(databasePath) ||
        !this.dependencies.isFileAvailable(demoDatabasePath)
      ) {
        return {
          error:
            "評価用demo.dbがありません。`pnpm --filter @mf-dashboard/db build:demo --period=2026-07`を実行してください。",
        };
      }
      if (
        this.dependencies.canonicalizePath(databasePath) !==
        this.dependencies.canonicalizePath(demoDatabasePath)
      ) {
        return { error: "評価では匿名化されたdata/demo.dbのみ使用できます。" };
      }
      if (!this.dependencies.isLLMEnabled()) {
        return { error: "AI_PROVIDER、AI_MODEL、AI_API_KEYを設定してください。" };
      }

      const db = this.dependencies.getDb();
      const group = await this.dependencies.getCurrentGroup(db);
      if (!group) return { error: "評価用demo.dbに現在のグループがありません。" };

      const response = await this.dependencies.generate({
        abortSignal: AbortSignal.timeout(FINANCE_CHAT_REQUEST_TIMEOUT_MS),
        maxOutputTokens: FINANCE_CHAT_MAX_OUTPUT_TOKENS,
        model: this.dependencies.getModel(),
        prepareStep: ({ stepNumber }) =>
          stepNumber === FINANCE_CHAT_MAX_GENERATION_STEPS - 1 ? { toolChoice: "none" } : undefined,
        prompt,
        stopWhen: stepCountIs(FINANCE_CHAT_MAX_GENERATION_STEPS),
        system: getFinanceChatSystemPrompt(getEvaluationDate(context?.vars?.evaluationDate)),
        timeout: { totalMs: FINANCE_CHAT_REQUEST_TIMEOUT_MS },
        tools: createFinanceChatTools(db, group.id),
      });
      const verificationSql = context?.vars?.verificationSql;
      const fixtureResult =
        typeof verificationSql === "string"
          ? await this.dependencies.queryFixture(db, verificationSql, group.id)
          : null;

      return { output: JSON.stringify(toEvaluationOutput(response, fixtureResult)) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "評価の実行に失敗しました。" };
    }
  }
}
