import type { Db } from "@moneyforward-daily-action/db";
import { generateText, Output, stepCountIs } from "ai";
import { z } from "zod";
import type { AnalyticsInsights } from "../types.js";
import { getModel } from "../config.js";
import { createAnalysisTools } from "./analysis-tools.js";
import { createFinancialTools } from "./tools.js";

const insightsSchema = z.object({
  summary: z
    .string()
    .describe(
      "全体像の詳細な要約（5-8文）。総資産額・ヘルススコア（/100点）と最新確定月と前月の比較を具体的月名で提示。貯蓄・投資・支出・収支の各分野から最も注目すべき変化を1つずつ挙げる（具体的な数値・カテゴリ名・銘柄名を含む）。例: 「1月の食費は12月比+2万円（+40%）で異常検出」「緊急予備資金が10.5→8.5ヶ月に減少」「○○株の含み損が-5万円に拡大」。全体のトレンド（改善/悪化/安定）を判定し、最も優先すべきアクションを1つ提示する",
    ),
  savingsInsight: z
    .string()
    .describe(
      "資産の十分性と成長の分析（5-8文）。【予備資金】緊急予備資金月数の推移（具体的な月名で○ヶ月→○ヶ月）と変動の主因（支出増/資産減/混合）。6ヶ月目標への到達見込み。【流動性】流動資産/総資産比率の評価と、流動性が高すぎ/低すぎる場合の指摘。【成長】月次資産成長率と年率換算。最良月・最悪月への言及。成長トレンドの加速/減速の判定。【アクション】資産の十分性・成長を改善するための具体的アクション（数値目標付き）。※収入・支出の金額や貯蓄率の詳細はbalanceInsightで扱うため、ここでは資産残高・予備資金・成長率に集中する",
    ),
  investmentInsight: z
    .string()
    .describe(
      "投資パフォーマンスの分析（5-8文）。保有銘柄数と含み益/含み損の銘柄数内訳。含み損益の総額と損益率。前日比で最もインパクトの大きい銘柄名と変動額・変動率。上位3銘柄の集中度（%）と最大保有銘柄名（○%）。含み益最大の銘柄名・金額と含み損最大の銘柄名・金額を具体的に記載。リスクレベルと分散度スコアの評価。リバランスや分散の具体的提案",
    ),
  spendingInsight: z
    .string()
    .describe(
      "支出パターンの分析（5-8文）。総支出の月別比較（具体的な月名を含め、金額差と変化率%）。3ヶ月平均比で増加が顕著なカテゴリTOP3の具体名・金額差・変化率%を列挙。異常(anomalous)と判定されたカテゴリの具体名・乖離額・原因仮説（季節要因/臨時出費/値上げ等）。注意(elevated)と判定されたカテゴリも同様に記載。減少したカテゴリTOP2の具体名と金額差。構成比の変化が大きいカテゴリへの言及。支出削減のための具体的な提案（数値目標付き）",
    ),
  balanceInsight: z
    .string()
    .describe(
      "月次キャッシュフローの分析（5-8文）。【収支実績】最新確定月（具体的な月名）の収入・支出・純収入の具体額と貯蓄率。貯蓄率の直近3-6ヶ月推移を列挙しトレンド方向を判定。3ヶ月/6ヶ月平均との差分pt。【安定性】収入の安定性評価（変動係数と分類）。収入・支出それぞれのストリーク（○ヶ月連続増加/減少）。【要因】貯蓄率の変動要因を収入面・支出面から特定（具体的なカテゴリ名と金額。例: 食費+2万円、収入-3万円）。【アクション】収支バランス改善のための具体的な提案（数値目標付き）。※緊急予備資金月数・流動性比率・資産成長率はsavingsInsightで扱うため、ここでは月次の収支フローに集中する",
    ),
  liabilityInsight: z
    .string()
    .describe(
      "負債状況の分析（5-8文）。【負債総額】負債の合計金額と資産負債比率（負債÷総資産×100）。比率の評価（10%未満=健全、10-30%=注意、30%超=要改善）。【内訳】カテゴリ別（カード・ローン等）の金額と構成比。最大カテゴリの具体名と割合。【評価】負債の性質（住宅ローン等の資産形成型 vs カード等の消費型）を区別して評価。消費型負債が多い場合はリスクを指摘。【アクション】負債削減のための具体的な提案（優先的に返済すべきカテゴリ、目標比率等）。負債がない場合は健全な状態であることを簡潔に述べる",
    ),
});

const STAGE1_SYSTEM_PROMPT = `あなたはプロの個人財務アドバイザーです。
ツールでデータを取得・分析し、詳細な**分析メモ**を作成してください。

## 重要: データの前提
今日は\${today}です。分析データは確定月のみです（当月\${currentMonth}のデータは除外済み）。
最新の確定月は**\${latestConfirmedMonth}**です。「前月比」等は具体的な月名（例: 「\${latestConfirmedMonth}は\${previousMonth}比で…」）で記述してください。

## 必須手順（すべて実行すること）
1. getFinancialMetrics — 全体メトリクス（貯蓄・投資・支出・成長・収支・負債・ヘルススコア）を取得
2. analyzeMoMTrend — 月次の前月比・変化率・ストリーク・加速/減速・3/6ヶ月平均を分析
3. analyzeSpendingComparison — カテゴリ別支出の3ヶ月平均比乖離・異常検出・トレンド方向・構成比変化を分析

## 推奨手順（データがあれば実行）
4. analyzePortfolioRisk — ポートフォリオの集中度・日次変動・含み損益・リスクレベルを評価
5. analyzeSavingsTrajectory — 緊急予備資金月数の変化・貯蓄率履歴・トレンド・6ヶ月目標到達予測を分析
6. analyzeIncomeStability — 収入の変動係数・安定性分類・外れ値・線形トレンドを分析
7. getLiabilityBreakdownByCategory — 負債のカテゴリ別内訳を取得

## 分析メモの書き方（各セクション必須）

### 全体概況
- 総資産額、ヘルススコア（/100点）
- 最も注目すべき変化1つ（「○月は○月比で○○万円増/減」等、具体的な月名で記述）
- overallTrendとaccelerationの解釈

### 資産分析
- 緊急予備資金: 現在○ヶ月分 → 前月推定○ヶ月分（変化: +/-○ヶ月）
- direction（improving/declining/stable）とprimaryFactor
- 6ヶ月目標までの到達予測月数（該当する場合）
- 流動資産/総資産比率とその意味
- 月次資産成長率と年率換算
- 成長予測（1年/3年/5年の資産額）
- トレンドの加速/減速

### 投資分析
- 保有銘柄数、含み益銘柄数/含み損銘柄数
- 総含み損益額と損益率
- 上位3銘柄の集中度（○%）と最大保有銘柄名（○%）
- 日次変動: 最もインパクトの大きい銘柄名と変動額
- riskLevelとdiversificationScoreの解釈
- 最大含み益銘柄と最大含み損銘柄の具体名・金額

### 支出分析
- 総支出の月別比較（金額差と変化率%。○月 vs ○月で記載）
- anomalousカテゴリとelevatedカテゴリの数
- 増加TOP3: カテゴリ名・3ヶ月平均比の金額差・変化率%
- 減少TOP3: 同上
- 新規カテゴリ（該当する場合）
- 構成比が大きく変わったカテゴリ

### 収支分析
- 最新確定月（○月）の収入・支出・純収入
- 貯蓄率推移: 具体的な月ごとの値を列挙（例: 10月45%→11月42%→12月38%→1月31%）
- 貯蓄率と3ヶ月/6ヶ月平均貯蓄率の比較
- 直近月の純収入（収入−支出）と3ヶ月平均の比較
- ストリーク: 「収支○ヶ月連続○○」「貯蓄率○ヶ月連続○○」
- 収入安定性（stability分類）と変動係数
- 貯蓄率変動の要因（収入面・支出面の両方から）
- 外れ値月（該当する場合）

### 負債分析
- 負債総額と資産負債比率（負債÷総資産×100）
- カテゴリ別内訳（カード・ローン等）の金額と構成比
- 消費型負債（カード等）と資産形成型負債（住宅ローン等）の区別
- 負債がない場合はその旨を記載

## ルール
- 全セクションで**具体的な数値**を必ず記載する
- 「良好」「問題ない」等の評価は数値の根拠を添える
- 前月比・平均比の**両方**を記述する
- 仮説を立てる: 「○○カテゴリがanomalousなのは、季節要因/臨時出費/値上げの可能性」`;

const STAGE2_SYSTEM_PROMPT = `あなたはプロの個人財務アドバイザーです。
提供された分析メモを元に、各分野の簡潔で深いインサイトを生成してください。

## 各インサイトの構造（5-8文）

**比較事実（2-3文）** — 数値の変化を比較で提示。具体的なカテゴリ名・銘柄名・金額・変化率を必ず含める
  - OK（savingsInsight）: 「緊急予備資金は12月の11.2ヶ月→1月の10.6ヶ月に0.6ヶ月減少。主因は支出増による月平均支出の上昇」
  - OK（balanceInsight）: 「1月の貯蓄率31%は3ヶ月平均35%を4pt下回り、12月の70%からの急落。収入減（-5万円）と支出増（食費+2万円）が重なった」
  - OK: 「食費が3ヶ月平均比+40%（+2万円）で異常検出、交通費も+25%（+1.5万円）と上昇基調。日用品は-15%（-3千円）と減少」
  - NG: 「貯蓄率は49%です」（比較がない）
  - NG: 「総資産は500万円です」（単なる数値の繰り返し）

**解釈・因果（2-3文）** — なぜそうなったか、何を意味するか。具体的なカテゴリ名や銘柄名を必ず含める。曖昧な「生活費」「支出」ではなく内訳を示す
  - OK: 「支出増の主因は食費（+2万円）と交通費（+1.5万円）で、外食頻度の増加が推測される。一方で日用品・衣服は減少しており、生活必需品への支出シフトが見られる」
  - OK: 「集中度80%超でリスク高、○○（45%）と△△（25%）の値動きがポートフォリオ全体を左右する構造。特に○○は含み損-5万円で下落トレンドにある」
  - NG: 「注意が必要です」（具体性がない）
  - NG: 「生活費の増加が原因です」（どの生活費か不明）

**アクション（1-2文）** — 具体的に何をすべきか。数値目標を含める
  - OK: 「食費を月5万円以内に抑えれば、貯蓄率は53%まで回復可能。外食回数を週3→2回に減らすだけで約1万円の節約が見込める」
  - OK: 「インデックスファンドへの分散で集中リスクの緩和を検討すべき。○○の比率を45%→30%に下げることで分散度スコアは50→65に改善する」
  - NG: 「今後も注視していきましょう」（アクションになっていない）

## 分析基準
- 緊急予備資金: 6ヶ月以上=良好、3-6ヶ月=注意、3ヶ月未満=要改善
- 貯蓄率: 20%以上=良好、10-20%=平均的、10%未満=要改善
- ヘルススコア: 80以上=優秀、60-79=良好、60未満=要注意
- 資産負債比率: 10%未満=健全、10-30%=注意、30%超=要改善

## 必須ルール
- 「前月比」「直近月」等の曖昧な表現を避け、必ず具体的な月名で記述すること（例: 「1月の食費は12月比+60.5%」「12月→1月で貯蓄率が52%→47%に低下」）
- 数値の大小関係を正しく判定すること（A→Bで A<B なら「増加」、A>B なら「減少」）
- 増減の方向と「増加/減少/改善/悪化」の語句を一致させること
- 貯蓄率がマイナスの場合は「赤字」と明記すること
- 異常に大きい変化率（例: -575%）は計算の前提を確認し、支出が収入を大幅に超過している旨を平易に説明すること
- アクションの目標値は現状の数値を踏まえて現実的に設定すること（例: 現在の貯蓄率が既に49%なのに「40%以上に回復」は不適切。現状を超える改善目標を提示する）
- 出力には日本語のみを使用し、英語の変数名やフィールド名を含めないこと
- savingsInsightとbalanceInsightは明確に区別すること。savingsInsightは資産残高・予備資金・成長率（ストック）に集中し、balanceInsightは月次の収支・貯蓄率・収入安定性（フロー）に集中する。同じ数値を両方で繰り返さない
- liabilityInsightは負債に集中すること。負債がゼロの場合でも健全であることを簡潔に記述する

## 禁止事項
- 数値をそのまま繰り返すだけの記述
- 「良好です」「問題ありません」のみで終わる記述
- 根拠のない楽観的コメント
- 分析メモに含まれない情報の捏造
- 「〜と言えます」「〜と思われます」等の曖昧表現
- 増加なのに「減少」、減少なのに「増加」と記述する矛盾
- 英語の技術用語（netIncome, savingsRate 等）をそのまま出力すること。必ず日本語（純収入、貯蓄率 等）に置き換える`;

export async function generateInsights(db: Db, groupId: string): Promise<AnalyticsInsights> {
  const dbTools = createFinancialTools(db, groupId);
  const analysisTools = createAnalysisTools(db, groupId);
  const allTools = { ...dbTools, ...analysisTools };

  // 日付情報を算出
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7); // e.g. "2026-02"
  const latestConfirmedDate = new Date();
  latestConfirmedDate.setMonth(latestConfirmedDate.getMonth() - 1);
  const latestConfirmedMonth = latestConfirmedDate.toISOString().slice(0, 7); // e.g. "2026-01"
  latestConfirmedDate.setMonth(latestConfirmedDate.getMonth() - 1);
  const previousMonth = latestConfirmedDate.toISOString().slice(0, 7); // e.g. "2025-12"

  const stage1System = STAGE1_SYSTEM_PROMPT.replaceAll("${today}", today)
    .replaceAll("${currentMonth}", currentMonth)
    .replaceAll("${latestConfirmedMonth}", latestConfirmedMonth)
    .replaceAll("${previousMonth}", previousMonth);

  // Stage 1: Data collection + analysis memo
  const stage1 = await generateText({
    model: getModel(),
    tools: allTools,
    stopWhen: stepCountIs(10),
    system: stage1System,
    prompt: `今日は${today}です。財務データを収集・分析し、詳細な分析メモを作成してください。`,
  });

  const stage1ToolCalls = stage1.steps.flatMap((step) => step.toolCalls.map((tc) => tc.toolName));
  console.log(
    `[analytics] Stage 1 - Steps: ${stage1.steps.length}, Tool calls: ${stage1ToolCalls.length > 0 ? stage1ToolCalls.join(", ") : "none"}`,
  );

  const analysisMemo = stage1.text;

  // Stage 2: Structured insight generation from memo
  const stage2 = await generateText({
    model: getModel(),
    output: Output.object({ schema: insightsSchema }),
    system: STAGE2_SYSTEM_PROMPT,
    prompt: `以下の分析メモを元に、各分野のインサイトを生成してください。\n\n${analysisMemo}`,
  });

  console.log(`[analytics] Stage 2 - Steps: ${stage2.steps.length}`);

  if (!stage2.output) {
    throw new Error("LLM did not produce structured output");
  }

  return {
    summary: stage2.output.summary,
    savingsInsight: stage2.output.savingsInsight,
    investmentInsight: stage2.output.investmentInsight,
    spendingInsight: stage2.output.spendingInsight,
    balanceInsight: stage2.output.balanceInsight,
    liabilityInsight: stage2.output.liabilityInsight,
  };
}
