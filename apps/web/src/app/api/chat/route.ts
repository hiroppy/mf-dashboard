import { createHmac } from "node:crypto";
import { financeChatCardsSchema, type FinanceChatCard } from "@mf-dashboard/analytics/chat/cards";
import {
  FINANCE_CHAT_MAX_TOOL_STEPS,
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
import { createFinanceChatLinkSanitizer } from "./link-sanitizer";

export const maxDuration = 60;

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_TEXT_LENGTH = 8_000;
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

function getPresentationCards(message: UIMessage): FinanceChatCard[] {
  const outputs: unknown[] = [];

  for (const part of message.parts) {
    if (
      !isToolUIPart(part) ||
      getToolName(part) !== "presentFinanceCards" ||
      part.state !== "output-available"
    ) {
      continue;
    }

    outputs.push(part.output);
  }

  return getSinglePresentationCards(outputs);
}

function getSinglePresentationCards(outputs: unknown[]): FinanceChatCard[] {
  if (outputs.length !== 1) return [];

  const result = financeChatCardsSchema.safeParse(outputs[0]);
  return result.success ? result.data : [];
}

function signAssistantMessage(groupId: string, text: string, cards: FinanceChatCard[]): string {
  return createHmac("sha256", process.env.AI_API_KEY!)
    .update(`${groupId}\0${text}\0${JSON.stringify(cards)}`)
    .digest("hex");
}

function hasValidAssistantSignature(message: UIMessage, groupId: string): boolean {
  const metadata = message.metadata;

  return (
    typeof metadata === "object" &&
    metadata !== null &&
    SIGNATURE_METADATA_KEY in metadata &&
    metadata[SIGNATURE_METADATA_KEY] ===
      signAssistantMessage(groupId, getMessageText(message), getPresentationCards(message))
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
      if (message.role !== "assistant") {
        return { ...message, parts: message.parts.filter((part) => !isToolUIPart(part)) };
      }

      const cards = getPresentationCards(message);
      const parts = message.parts.filter((part) => part.type === "text");

      if (cards.length > 0) {
        parts.push({
          type: "text",
          text: `\n\n直前の回答で表示したカード: ${JSON.stringify(cards)}`,
        });
      }

      return { ...message, parts };
    })
    .filter((message) => message.parts.length > 0);
}

function hasValidConversationBounds(messages: UIMessage[]): boolean {
  if (messages.length === 0 || messages.length > MAX_MESSAGES) return false;

  let conversationTextLength = 0;
  for (const message of messages) {
    if (message.role === "user" && message.parts.some((part) => part.type !== "text")) return false;
    const textLength = getMessageText(message).length;
    if (textLength > MAX_MESSAGE_TEXT_LENGTH) return false;
    conversationTextLength += textLength;
  }

  const latestMessage = messages.at(-1);
  return (
    conversationTextLength <= MAX_CONVERSATION_TEXT_LENGTH &&
    latestMessage?.role === "user" &&
    getMessageText(latestMessage).trim().length > 0
  );
}

async function readRequestText(request: Request): Promise<string | undefined> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();

    byteLength += value.byteLength;
    if (byteLength > MAX_REQUEST_BYTES) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    text += decoder.decode(value, { stream: true });
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "チャット履歴が大きすぎます。");
  }

  try {
    const requestText = await readRequestText(request);
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

  const tools = createFinanceChatTools(db, group.id);
  const modelInputMessages = getTrustedModelMessages(validation.data, group.id);
  let assistantText = "";
  const presentationOutputs: unknown[] = [];
  const result = streamText({
    abortSignal: request.signal,
    experimental_transform: [
      createFinanceChatLinkSanitizer(group.id, (text) => {
        assistantText += text;
      }),
      smoothStream(),
    ],
    model,
    system: getFinanceChatSystemPrompt(),
    messages: await convertToModelMessages(modelInputMessages, { tools }),
    onChunk: ({ chunk }) => {
      if (chunk.type === "tool-result" && chunk.toolName === "presentFinanceCards") {
        presentationOutputs.push(chunk.output);
      }
    },
    tools,
    stopWhen: stepCountIs(FINANCE_CHAT_MAX_TOOL_STEPS),
  });

  return result.toUIMessageStreamResponse({
    consumeSseStream: consumeStream,
    messageMetadata: ({ part }) =>
      part.type === "finish"
        ? {
            [SIGNATURE_METADATA_KEY]: signAssistantMessage(
              group.id,
              assistantText,
              getSinglePresentationCards(presentationOutputs),
            ),
          }
        : undefined,
    originalMessages: validation.data,
    onError: () => "回答の生成中にエラーが発生しました。",
  });
}
