import { createFinanceChatTools } from "@mf-dashboard/analytics/chat/tools";
import { getModel, isLLMEnabled } from "@mf-dashboard/analytics/config";
import { getCurrentGroup, getDb } from "@mf-dashboard/db";
import {
  convertToModelMessages,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

export const maxDuration = 30;

const MAX_TOOL_STEPS = 8;

const SYSTEM_PROMPT = `あなたは家計改善を支援するAIアシスタントです。
- 回答前に必要な家計データをツールで取得し、提案には根拠となる期間・項目・数値を明記してください。
- 金額、取引、口座、URLを推測・捏造しないでください。金額はツール結果だけを根拠にしてください。
- ページへ誘導するときは、ツール結果とアプリのroute builderから提供された内部リンクだけを使用してください。URLを自作しないでください。
- 個人情報や家計データを必要以上に繰り返さず、外部共有を促さないでください。
- 断定できない場合は不足している根拠を明示し、追加確認を促してください。
- 回答は簡潔な日本語で、実行可能な家計改善策を優先してください。`;

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function isWithinChatAccessBoundary(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return process.env.VERCEL !== "1" && Boolean(request.headers.get("cf-access-jwt-assertion"));
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

  const messages =
    typeof body === "object" && body !== null && "messages" in body
      ? (body as { messages: unknown }).messages
      : undefined;
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

  const db = getDb();
  const currentGroup = await getCurrentGroup(db);

  if (!currentGroup) {
    return errorResponse(409, "CURRENT_GROUP_NOT_FOUND", "現在のグループが選択されていません。");
  }

  let model;

  try {
    model = getModel();
  } catch {
    return errorResponse(503, "LLM_NOT_CONFIGURED", "LLM設定を確認してください。");
  }

  const tools = createFinanceChatTools(db, currentGroup.id);
  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(validation.data, { tools }),
    tools,
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: validation.data,
    onError: () => "回答の生成中にエラーが発生しました。",
  });
}
