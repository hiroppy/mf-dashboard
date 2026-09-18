import {
  getJstTodayIsoDate,
  getJstYearMonthKey,
  shiftYearMonthKey,
} from "@mf-dashboard/date-utils";
import type { Db } from "@mf-dashboard/db";
import { generateText, Output, stepCountIs } from "ai";
import { z } from "zod";
import { getModel } from "../config.js";
import type { AnalyticsInsights } from "../types.js";
import { createAnalysisTools } from "./analysis-tools.js";
import { createFinancialTools } from "./tools.js";

const insightsSchema = z.object({
  summary: z
    .string()
    .describe(
      "家計全体で最も重要な変化とその意味を3-5文で要約する。総資産額・ヘルススコアを示し、貯蓄・投資・支出・収支から特に重要な1-2点に絞る。対応が必要な場合だけ、優先度の高いアクションを1つ提示する",
    ),
  savingsInsight: z
    .string()
    .describe(
      "資産の十分性と成長について、今判断に役立つ要点を3-5文で伝える。緊急予備資金、流動性、資産成長のうち重要な変化を優先し、すべてを機械的に列挙しない。※収入・支出の金額や貯蓄率の詳細はbalanceInsightで扱う",
    ),
  investmentInsight: z
    .string()
    .describe(
      "投資状況について、リスクまたは機会として重要な点を3-5文で伝える。損益、集中度、日次変動のうち意思決定に影響するものを優先し、重要でない指標は省く",
    ),
  spendingInsight: z
    .string()
    .describe(
      "支出パターンについて、総支出を動かした主要因を3-5文で伝える。カテゴリは影響額の大きい1-3件に絞り、変化率だけが大きく金額が小さい項目を過度に強調しない。根拠がない原因は断定しない",
    ),
  balanceInsight: z
    .string()
    .describe(
      "月次キャッシュフローについて、最新確定月の収支とその主要因を3-5文で伝える。貯蓄率の推移や収入安定性は判断に必要な範囲だけ示す。※緊急予備資金月数・流動性比率・資産成長率はsavingsInsightで扱う",
    ),
  liabilityInsight: z
    .string()
    .describe(
      "負債状況について、総額・資産負債比率・性質から重要な点を2-4文で伝える。問題がなければ簡潔に述べ、不要な返済提案を作らない",
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

## すべての項目に共通する最優先原則
- 読み手の判断に役立つ、重要性の高い事実だけを伝える
- 分析メモや算出値で確認できる事実と、そこから直接導ける解釈だけを書く
- 情報を埋めるための推測、一般論、定型的な助言は書かない
- 重要な変化がなければ、無理に問題を作らず「大きな変化はない」と根拠を添えて簡潔に伝える
- 各項目は、それだけ読んでも要点が一度で理解できる平易な日本語にする

## 書き方
- 最初の1文で、その分野で最も重要な結論を伝える
- 続く文で、結論を支える比較や内訳を自然につなげる。数値は判断に必要なものだけに絞る
- 読み手が行動を変えるべき場合だけ、最後に実行可能な提案を1つ添える。現状が健全なら維持すべき条件を簡潔に示す
- 見出しやラベルを一切付けず、最初から自然な文章として書く。「比較事実：」「解釈・因果：」「アクション：」「結論：」「最重要結論：」「要点：」のような「短い語句＋コロン」で文を始めない
- 原則3-5文とし、一文を長くしすぎない。負債がない場合など情報が少なければ1-2文でよい
- 網羅性より重要度を優先する。同じ数値を繰り返さず、細かな数値の羅列を避ける
- 金額と変化率を常に併記する必要はない。変化率は比較の理解に役立つ場合に限る
- 原因がデータで確認できない場合は断定せず、「一時的な支払いの可能性があるため明細を確認」のように事実と確認事項を分ける
- 一つの文に複数の論点や数値を詰め込まず、修飾語や重複表現を削る

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
- 分析上の重要性がない限り、すべてのインサイトに数値目標や追加の積立・削減を提案しない

## 禁止事項
- 数値をそのまま繰り返すだけの記述
- 「良好です」「問題ありません」のみで終わる記述
- 根拠のない楽観的コメント
- 分析メモに含まれない情報の捏造
- 分析メモから確認できない原因、将来額、改善効果の数値を作ること
- 「〜と言えます」「〜と思われます」等の曖昧表現
- 増加なのに「減少」、減少なのに「増加」と記述する矛盾
- 英語の技術用語（netIncome, savingsRate 等）をそのまま出力すること。必ず日本語（純収入、貯蓄率 等）に置き換える`;

const LEADING_LABEL_PATTERN =
  /(^\s*|[。！？\n]\s*)(?:比較事実|解釈・因果|アクション|結論|最重要結論|要点|評価|収支)[：:]\s*/g;

function normalizeInsight(text: string): string {
  return text.replace(LEADING_LABEL_PATTERN, "$1").replace(/[：:]/g, "、");
}

export async function generateInsights(db: Db, groupId: string): Promise<AnalyticsInsights> {
  const dbTools = createFinancialTools(db, groupId);
  const analysisTools = createAnalysisTools(db, groupId);
  const allTools = { ...dbTools, ...analysisTools };

  // 日付情報を算出
  const today = getJstTodayIsoDate();
  const currentMonth = getJstYearMonthKey(); // e.g. "2026-02"
  const latestConfirmedMonth = shiftYearMonthKey(currentMonth, -1); // e.g. "2026-01"
  const previousMonth = shiftYearMonthKey(currentMonth, -2); // e.g. "2025-12"

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
    summary: normalizeInsight(stage2.output.summary),
    savingsInsight: normalizeInsight(stage2.output.savingsInsight),
    investmentInsight: normalizeInsight(stage2.output.investmentInsight),
    spendingInsight: normalizeInsight(stage2.output.spendingInsight),
    balanceInsight: normalizeInsight(stage2.output.balanceInsight),
    liabilityInsight: normalizeInsight(stage2.output.liabilityInsight),
  };
}
