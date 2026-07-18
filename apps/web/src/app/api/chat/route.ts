import { createHmac } from "node:crypto";
import { createFinanceChatTools } from "@mf-dashboard/analytics/chat/tools";
import { getModel, isLLMEnabled } from "@mf-dashboard/analytics/config";
import { getAllGroups, getCurrentGroup, getDb, isDatabaseAvailable } from "@mf-dashboard/db";
import {
  consumeStream,
  convertToModelMessages,
  isToolUIPart,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

export const maxDuration = 30;

const MAX_TOOL_STEPS = 8;
const SIGNATURE_METADATA_KEY = "serverSignature";

const SYSTEM_PROMPT = `あなたは家計改善を支援するAIアシスタントです。
- 回答前に必要な家計データをツールで取得し、提案には根拠となる期間・項目・数値を明記してください。
- 金額、取引、口座、URLを推測・捏造しないでください。金額はツール結果だけを根拠にしてください。
- ページへ誘導するときは、ツール結果とアプリのroute builderから提供された内部リンクだけを使用してください。URLを自作しないでください。
- 個人情報や家計データを必要以上に繰り返さず、外部共有を促さないでください。
- 断定できない場合は不足している根拠を明示し、追加確認を促してください。
- 回答は簡潔な日本語で、実行可能な家計改善策を優先してください。
- データ取得後は必ずpresentFinanceCardsを1回呼び、本文の要点をstructured cardsでも提示してください。
- 「6/10の支出を見たい」など日付別支出には、expenseを検索し、summary、transactionList、actionの順で提示してください。
- 「今月どう？」など月次状況には、対象月の収支を取得し、summaryとinsightを提示してください。
- 「今月の食費は？」などカテゴリ支出には、対象月・カテゴリの取引とカテゴリ合計を取得し、summary、categoryBreakdown、transactionListを提示してください。
- 「削れそうな支出ある？」には、固定費・変動費と過去比較を取得し、変動費の候補を中心に、固定費を別枠のinsightで提示してください。手残りと貯蓄率がどれだけ改善するかを主な判断基準にしてください。
- 「総資産は？」には最新の総資産を取得し、summaryを提示してください。
- 該当データがない場合、金額を推測せずemptyだけを提示し、期間や条件を変える代替promptを1〜3件含めてください。
- empty以外ではgetFinanceDashboardRouteを呼び、その結果だけをhrefまたはactionに使って、詳細ページへ遷移できるCTAを少なくとも1件含めてください。
- 投資余力を扱う場合は、手残り、貯蓄率、予備資金、負債、資産の集中度をすべて確認し、不足する観点があれば結論を保留してください。`;

function getSystemPrompt(): string {
  const currentDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
  return `${SYSTEM_PROMPT}\n- 現在日付は${currentDate}（Asia/Tokyo）です。年のない日付はこの日付を基準に解釈してください。`;
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function isWithinChatAccessBoundary(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return process.env.VERCEL !== "1" && Boolean(request.headers.get("cf-access-jwt-assertion"));
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function signAssistantMessage(groupId: string, text: string): string {
  return createHmac("sha256", process.env.AI_API_KEY!).update(`${groupId}\0${text}`).digest("hex");
}

function hasValidAssistantSignature(message: UIMessage, groupId: string): boolean {
  const metadata = message.metadata;

  return (
    typeof metadata === "object" &&
    metadata !== null &&
    SIGNATURE_METADATA_KEY in metadata &&
    metadata[SIGNATURE_METADATA_KEY] === signAssistantMessage(groupId, getMessageText(message))
  );
}

function getTrustedModelMessages(messages: UIMessage[], groupId: string): UIMessage[] {
  return messages
    .filter(
      (message) =>
        message.role === "user" ||
        (message.role === "assistant" && hasValidAssistantSignature(message, groupId)),
    )
    .map((message) => ({
      ...message,
      parts: message.parts.filter((part) =>
        message.role === "assistant" ? part.type === "text" : !isToolUIPart(part),
      ),
    }))
    .filter((message) => message.parts.length > 0);
}

export async function POST(request: Request): Promise<Response> {
  if (!isWithinChatAccessBoundary(request)) {
    return errorResponse(403, "CHAT_ACCESS_DENIED", "チャットAPIへのアクセスが拒否されました。");
  }

  let body: unknown;

  try {
    body = await request.json();
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
  const result = streamText({
    abortSignal: request.signal,
    model,
    system: getSystemPrompt(),
    messages: await convertToModelMessages(modelInputMessages, { tools }),
    onChunk: ({ chunk }) => {
      if (chunk.type === "text-delta") assistantText += chunk.text;
    },
    tools,
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
  });

  return result.toUIMessageStreamResponse({
    consumeSseStream: consumeStream,
    messageMetadata: ({ part }) =>
      part.type === "finish"
        ? { [SIGNATURE_METADATA_KEY]: signAssistantMessage(group.id, assistantText) }
        : undefined,
    originalMessages: validation.data,
    onError: () => "回答の生成中にエラーが発生しました。",
  });
}
