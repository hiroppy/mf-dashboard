import { generateText, Output } from "ai";
import { z } from "zod";
import { getModel, isLLMEnabled } from "./config.js";

export interface CategoryCandidateForLLM {
  largeCategoryName: string;
  middleCategoryName: string;
  isIncome: boolean;
}

export interface TransactionForLLMCategorization {
  date: string;
  amount: number;
  type: "income" | "expense";
  accountName?: string;
  description: string;
}

export interface LLMCategoryDecision {
  source: "llm";
  category: string;
  subCategory: string;
  confidence: number;
  reason: string;
}

const categoryDecisionSchema = z.object({
  category: z.string(),
  subCategory: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

function formatCandidate(candidate: CategoryCandidateForLLM): string {
  const direction = candidate.isIncome ? "収入" : "支出";
  return `- ${candidate.largeCategoryName} > ${candidate.middleCategoryName} (${direction})`;
}

export async function generateCategoryDecisionWithLLM(options: {
  transaction: TransactionForLLMCategorization;
  candidates: CategoryCandidateForLLM[];
}): Promise<LLMCategoryDecision | null> {
  if (!isLLMEnabled()) return null;

  const { transaction, candidates } = options;
  const candidateList = candidates.map(formatCandidate).join("\n");

  const result = await generateText({
    model: getModel(),
    output: Output.object({ schema: categoryDecisionSchema }),
    system:
      "あなたはMoney Forwardの未分類取引を分類するアシスタントです。必ず候補カテゴリ一覧に存在するcategory/subCategoryの組み合わせだけを選んでください。カテゴリIDは出力しません。",
    prompt: `以下の未分類取引に最も適したカテゴリを候補カテゴリ一覧から1つ選んでください。

取引:
- 日付: ${transaction.date}
- 種別: ${transaction.type === "income" ? "収入" : "支出"}
- 金額: ${transaction.amount}
- 金融機関: ${transaction.accountName ?? "不明"}
- 内容: ${transaction.description}

候補カテゴリ:
${candidateList}

confidenceは0から1の数値で、候補に強く一致するときだけ高くしてください。`,
  });

  if (!result.output) return null;

  return {
    source: "llm",
    category: result.output.category,
    subCategory: result.output.subCategory,
    confidence: result.output.confidence,
    reason: result.output.reason,
  };
}
