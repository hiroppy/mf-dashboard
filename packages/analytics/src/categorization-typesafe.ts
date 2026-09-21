import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import {
  candidateKey,
  type CategoryCandidateForLLM,
  type LLMCategoryDecision,
} from "./categorization.js";

const INSTRUCTIONS =
  "この取引に最も適した Money Forward のカテゴリを 1 つ選んでください。description は銀行やカード会社が記録した店名で、半角カタカナやカードブランドの接頭辞 (例: 'VISA国内利用 VS') を含むことがあります。";

interface TransactionForTypeSafe {
  date: string;
  amount: number;
  type: "income" | "expense";
  description: string;
}

function candidatesToCriteria(candidates: CategoryCandidateForLLM[]): Record<string, string> {
  return Object.fromEntries(
    candidates.map((candidate) => [
      candidateKey(candidate),
      `${candidate.largeCategoryName} > ${candidate.middleCategoryName}`,
    ]),
  );
}

function buildReason(
  probabilities: Record<string, number>,
  candidatesById: Map<string, CategoryCandidateForLLM>,
): string {
  return Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, p]) => {
      const candidate = candidatesById.get(key);
      const name = candidate
        ? `${candidate.largeCategoryName} > ${candidate.middleCategoryName}`
        : key;
      return `${name} ${p.toFixed(2)}`;
    })
    .join(" / ");
}

export async function generateCategoryDecisionWithTypeSafe(options: {
  transaction: TransactionForTypeSafe;
  candidates: CategoryCandidateForLLM[];
}): Promise<LLMCategoryDecision | null> {
  const candidatesById = new Map(
    options.candidates.map((candidate) => [candidateKey(candidate), candidate]),
  );
  if (candidatesById.size === 0) return null;

  const client = new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY });
  const criteria = candidatesToCriteria(options.candidates);

  const result = await client.systemOne({
    state: {
      date: options.transaction.date,
      amount: options.transaction.amount,
      type: options.transaction.type,
      description: options.transaction.description,
    },
    questions: { category: choice(INSTRUCTIONS, criteria) },
  });

  const answer = result.answers.category;
  const decided = candidatesById.get(answer.choice);
  if (!decided) return null;

  return {
    source: "llm",
    largeCategoryId: decided.largeCategoryId,
    middleCategoryId: decided.middleCategoryId,
    confidence: answer.confidence,
    reason: buildReason(answer.probabilities, candidatesById),
  };
}
