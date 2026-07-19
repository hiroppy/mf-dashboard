import { createHmac } from "node:crypto";
import { financeChatCardsSchema, type FinanceChatCard } from "@mf-dashboard/analytics/chat/cards";
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

const MAX_TOOL_STEPS = 8;
const SIGNATURE_METADATA_KEY = "serverSignature";

const SYSTEM_PROMPT = `あなたは家計改善を支援するAIアシスタントです。
- 回答前に必要な家計データをツールで取得し、提案には根拠となる期間・項目・数値を明記してください。
- 高レベルの要約、比較、傾向分析、改善提案では、必要な指標が一括で得られるgetFinancialMetricsを優先してください。その結果に含まれるデータを別ツールで再取得しないでください。
- 複数のツールが必要な場合、互いに依存しないツールは同じステップで並列に呼び出してください。先行ツールの結果が入力に必要な場合だけ逐次呼び出してください。
- データ取得は回答に必要な最小限にし、同じ期間・指標を異なるツールで重複取得しないでください。
- 金額、取引、口座、URLを推測・捏造しないでください。金額はツール結果だけを根拠にしてください。
- ページへ誘導するときは、getFinanceDashboardRouteが返したhrefだけを一字も変えずに使用してください。URLを自作せず、ホスト名、#、仮URL、プレースホルダーを付けないでください。hrefを取得していない場合はリンク自体を出さないでください。
- 収入・支出・収支・取引・カテゴリ・固定費・変動費の詳細には、getFinanceDashboardRouteをpage="cashFlow"かつ対象のmonthで呼び出してください。資産・負債・保有銘柄にはpage="balanceSheet"、口座にはpage="accounts"、分析結果にはpage="insights"、シミュレーションにはpage="simulator"、概要画面そのものにはpage="dashboard"を使用してください。
- 本文にリンクを書く場合は、getFinanceDashboardRouteが返したhrefをMarkdownのリンク先にそのまま使ってください。カードのhrefまたはaction.hrefにも同じhrefをそのまま使ってください。
- 個人情報や家計データを必要以上に繰り返さず、外部共有を促さないでください。
- 断定できない場合は不足している根拠を明示し、追加確認を促してください。
- 回答は簡潔な日本語で、実行可能な家計改善策を優先してください。
- データ取得後は必ずpresentFinanceCardsを1回呼び、数値、内訳、比較、詳細導線はstructured cardsを主として提示してください。
- カードは原則2枚以内にし、すでに取得したデータだけで作成してください。カードを増やすためだけに追加のデータ取得ツールを呼ばないでください。
- transactionListは、ユーザーが取引、明細、特定日、特定カテゴリの詳細を明示的に求めた場合だけ使用してください。要約、比較、傾向、改善提案では使用しないでください。
- chartは、ユーザーが「グラフ」「チャート」「可視化」など視覚化を明示した場合、または比較・推移・構成比を文章や数値だけより明確に伝えられると判断した場合に使用してください。単純な金額回答や短い要約には使用しないでください。時系列にはline、項目比較にはbar、単一系列の構成比にはpieを使用してください。pieのdataは最大5件にし、6件以上ある場合は主要4件以外を「その他」に集約してください。
- カードだけでユーザーの質問に答えられるよう、結論、必要な根拠、実行可能な次の一歩、詳細導線をカードに含めてください。本文はカード生成に失敗した場合のフォールバックとして簡潔に作成し、カードの内容を繰り返さないでください。
- summaryとinsightを併用する場合、summaryは主要な数値、insightは数値の再掲ではなく解釈と改善提案に役割を分けてください。
- insightにamountを含める場合は、金額の意味を示すamountLabelとamountTypeも必ず含めてください。amount、amountLabel、amountTypeは3項目すべてを指定するか、すべて省略してください。
- 「6/10の支出を見たい」など日付別支出には、expenseを検索し、summary、transactionList、actionの順で提示してください。
- 「今月どう？」など月次状況には、対象月の収支を取得し、summaryとinsightを提示してください。
- 「今月の食費は？」などカテゴリ支出には、対象月・カテゴリの取引とカテゴリ合計を取得し、summary、categoryBreakdown、transactionListを提示してください。
- 「削れそうな支出ある？」には、支出傾向、カテゴリ、手残り、貯蓄率を確認し、変動しやすいカテゴリと異常支出を優先してください。insightのdescriptionには対象期間、具体的なカテゴリ、比較基準、見直し理由を含め、単に「特別な支出」「異常支出」とだけ表現しないでください。amountを出す場合は何を合計した金額かが分かるamountLabel（例:「見直し候補額」）を付け、削減できると断定せず候補額として示し、amountType="balance"を使用してください。CTAは「詳細を確認」ではなく「内訳を確認」など遷移先で確認できる内容を明記してください。
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

export async function POST(request: Request): Promise<Response> {
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
    system: getSystemPrompt(),
    messages: await convertToModelMessages(modelInputMessages, { tools }),
    onChunk: ({ chunk }) => {
      if (chunk.type === "tool-result" && chunk.toolName === "presentFinanceCards") {
        presentationOutputs.push(chunk.output);
      }
    },
    tools,
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
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
