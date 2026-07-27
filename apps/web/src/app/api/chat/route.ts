import { createHmac } from "node:crypto";
import { financeChartSchema, type FinanceChart } from "@mf-dashboard/analytics/chat/chart";
import {
  FINANCE_CHAT_MAX_GENERATION_STEPS,
  FINANCE_CHAT_MAX_OUTPUT_TOKENS,
  FINANCE_CHAT_REQUEST_TIMEOUT_MS,
  getFinanceChatSystemPrompt,
} from "@mf-dashboard/analytics/chat/prompt";
import { createFinanceChatTools } from "@mf-dashboard/analytics/chat/tools";
import { getModel, isLLMEnabled } from "@mf-dashboard/analytics/config";
import { getAllGroups, getCurrentGroup, getDb, isDatabaseAvailable } from "@mf-dashboard/db";
import {
  consumeStream,
  convertToModelMessages,
  getToolName,
  isToolUIPart,
  safeValidateUIMessages,
  smoothStream,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { CHAT_MESSAGE_MAX_LENGTH } from "../../../lib/chat-limits";
import { hasValidCloudflareAccess } from "../../../lib/cloudflare-access";
import { acquireChatSlot } from "./chat-concurrency";

export const maxDuration = 60;

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_MESSAGES = 20;
const MAX_CONVERSATION_TEXT_LENGTH = 32_000;
const SIGNATURE_METADATA_KEY = "serverSignature";

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getMessageCharts(message: UIMessage): FinanceChart[] {
  return message.parts.flatMap((part) => {
    if (
      !isToolUIPart(part) ||
      getToolName(part) !== "presentChart" ||
      part.state !== "output-available"
    ) {
      return [];
    }

    const chart = financeChartSchema.safeParse(part.output);
    return chart.success ? [chart.data] : [];
  });
}

function signAssistantMessage(groupId: string, text: string, charts: FinanceChart[]): string {
  return createHmac("sha256", process.env.AI_API_KEY!)
    .update(`${groupId}\0${text}\0${JSON.stringify(charts)}`)
    .digest("hex");
}

function hasValidAssistantSignature(message: UIMessage, groupId: string): boolean {
  const metadata = message.metadata;

  return (
    typeof metadata === "object" &&
    metadata !== null &&
    SIGNATURE_METADATA_KEY in metadata &&
    metadata[SIGNATURE_METADATA_KEY] ===
      signAssistantMessage(groupId, getMessageText(message), getMessageCharts(message))
  );
}

function getTrustedModelMessages(messages: UIMessage[], groupId: string): UIMessage[] {
  return messages
    .filter(
      (message) =>
        message.role === "user" ||
        (message.role === "assistant" && hasValidAssistantSignature(message, groupId)),
    )
    .map((message) => {
      const charts = message.role === "assistant" ? getMessageCharts(message) : [];
      return {
        ...message,
        parts: [
          ...message.parts.flatMap((part) =>
            part.type === "text" ? [{ type: "text" as const, text: part.text }] : [],
          ),
          ...charts.map((chart) => ({
            type: "text" as const,
            text: `[表示済みチャート]\n${JSON.stringify(chart)}`,
          })),
        ],
      };
    })
    .filter((message) => message.parts.length > 0);
}

function hasValidConversationBounds(messages: UIMessage[]): boolean {
  if (messages.length === 0 || messages.length > MAX_MESSAGES) return false;

  let conversationTextLength = 0;
  for (const message of messages) {
    if (message.role === "user" && message.parts.some((part) => part.type !== "text")) return false;
    const textLength = getMessageText(message).length;
    if (message.role === "user" && textLength > CHAT_MESSAGE_MAX_LENGTH) return false;
    conversationTextLength += textLength;
  }

  const latestMessage = messages.at(-1);
  return (
    conversationTextLength <= MAX_CONVERSATION_TEXT_LENGTH &&
    latestMessage?.role === "user" &&
    getMessageText(latestMessage).trim().length > 0
  );
}

async function readRequestText(
  request: Request,
  abortSignal: AbortSignal,
): Promise<string | null | undefined> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";
  let abortRead: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    abortRead = () => reject(abortSignal.reason ?? new Error("Request aborted."));
    abortSignal.addEventListener("abort", abortRead, { once: true });
  });

  try {
    abortSignal.throwIfAborted();
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) return text + decoder.decode();

      byteLength += value.byteLength;
      if (byteLength > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return undefined;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (!abortSignal.aborted) throw error;
    return null;
  } finally {
    abortSignal.removeEventListener("abort", abortRead);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!(await hasValidCloudflareAccess(request))) {
    return errorResponse(401, "UNAUTHORIZED", "認証が必要です。");
  }

  let body: unknown;
  const requestSignal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(FINANCE_CHAT_REQUEST_TIMEOUT_MS),
  ]);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return errorResponse(415, "INVALID_CONTENT_TYPE", "application/json形式が必要です。");
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "チャット履歴が大きすぎます。");
  }

  try {
    const requestText = await readRequestText(request, requestSignal);
    if (requestText === null) {
      return errorResponse(408, "REQUEST_TIMEOUT", "チャットリクエストが時間切れになりました。");
    }
    if (requestText === undefined) {
      return errorResponse(413, "REQUEST_TOO_LARGE", "チャット履歴が大きすぎます。");
    }
    body = JSON.parse(requestText);
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "JSON形式のリクエストが必要です。");
  }

  const requestBody =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const messages = requestBody.messages;
  const requestedGroupId = requestBody.groupId ?? undefined;

  if (
    requestedGroupId !== undefined &&
    (typeof requestedGroupId !== "string" || requestedGroupId.trim().length === 0)
  ) {
    return errorResponse(400, "INVALID_GROUP_ID", "有効なグループIDが必要です。");
  }

  const validation = await safeValidateUIMessages<UIMessage>({ messages });

  if (!validation.success) {
    return errorResponse(400, "INVALID_MESSAGES", "有効なチャットメッセージが必要です。");
  }

  if (validation.data.some((message) => message.role === "system")) {
    return errorResponse(400, "SYSTEM_MESSAGE_NOT_ALLOWED", "systemメッセージは指定できません。");
  }

  if (!hasValidConversationBounds(validation.data)) {
    return errorResponse(400, "INVALID_MESSAGES", "有効なチャットメッセージが必要です。");
  }

  if (!isLLMEnabled()) {
    return errorResponse(
      503,
      "LLM_NOT_CONFIGURED",
      "AI_PROVIDER、AI_MODEL、AI_API_KEYを設定してください。",
    );
  }

  if (!isDatabaseAvailable()) {
    return errorResponse(503, "DATABASE_NOT_AVAILABLE", "家計データがまだ利用できません。");
  }

  const db = getDb();
  const group = requestedGroupId
    ? (await getAllGroups(db)).find(({ id }) => id === requestedGroupId)
    : await getCurrentGroup(db);

  if (!group && requestedGroupId) {
    return errorResponse(404, "GROUP_NOT_FOUND", "指定されたグループが見つかりません。");
  }

  if (!group) {
    return errorResponse(409, "CURRENT_GROUP_NOT_FOUND", "現在のグループが選択されていません。");
  }

  let model;

  try {
    model = getModel();
  } catch {
    return errorResponse(503, "LLM_NOT_CONFIGURED", "LLM設定を確認してください。");
  }

  const releaseChatSlot = acquireChatSlot();
  if (!releaseChatSlot) {
    return errorResponse(429, "CHAT_BUSY", "AIチャットが混み合っています。");
  }

  try {
    const tools = createFinanceChatTools(db, group.id);
    const modelInputMessages = getTrustedModelMessages(validation.data, group.id);
    const assistantCharts: FinanceChart[] = [];
    let assistantText = "";
    const result = streamText({
      abortSignal: requestSignal,
      experimental_transform: smoothStream(),
      maxOutputTokens: FINANCE_CHAT_MAX_OUTPUT_TOKENS,
      model,
      onAbort: releaseChatSlot,
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta") assistantText += chunk.text;
        if (chunk.type === "tool-result" && chunk.toolName === "presentChart") {
          const chart = financeChartSchema.safeParse(chunk.output);
          if (chart.success) assistantCharts.push(chart.data);
        }
      },
      onError: releaseChatSlot,
      onFinish: releaseChatSlot,
      prepareStep: ({ stepNumber }) =>
        stepNumber === FINANCE_CHAT_MAX_GENERATION_STEPS - 1 ? { toolChoice: "none" } : undefined,
      system: getFinanceChatSystemPrompt(),
      timeout: { totalMs: FINANCE_CHAT_REQUEST_TIMEOUT_MS },
      messages: await convertToModelMessages(modelInputMessages, { tools }),
      tools,
      stopWhen: stepCountIs(FINANCE_CHAT_MAX_GENERATION_STEPS),
    });

    return result.toUIMessageStreamResponse({
      consumeSseStream: consumeStream,
      messageMetadata: ({ part }) =>
        part.type === "finish"
          ? {
              [SIGNATURE_METADATA_KEY]: signAssistantMessage(
                group.id,
                assistantText,
                assistantCharts,
              ),
            }
          : undefined,
      originalMessages: validation.data,
      onError: () => "回答の生成中にエラーが発生しました。",
    });
  } catch (error) {
    releaseChatSlot();
    throw error;
  }
}
