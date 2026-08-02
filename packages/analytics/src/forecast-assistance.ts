import {
  addDaysToIsoDateKey,
  getDayOfWeekIsoDateKey,
  parseIsoDateKey,
} from "@mf-dashboard/date-utils";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getModel, isLLMEnabled } from "./config.js";

const forecastClassificationSchema = z.enum([
  "salary",
  "card_payment",
  "rent",
  "loan",
  "tax",
  "other",
]);

const forecastSignalSchema = z.enum(["salary", "card_payment", "rent", "loan", "tax"]);

const dateAdjustmentSchema = z.enum(["none", "previous_business_day", "next_business_day"]);

const forecastLLMDecisionSchema = z
  .object({
    candidateId: z.string().min(1),
    classification: forecastClassificationSchema,
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1).max(240),
    dateAdjustment: dateAdjustmentSchema,
  })
  .strict();

export type ForecastClassification = z.infer<typeof forecastClassificationSchema>;
export type ForecastSignal = z.infer<typeof forecastSignalSchema>;
export type ForecastDateAdjustment = z.infer<typeof dateAdjustmentSchema>;

export interface ForecastCandidateFeatures {
  candidateId: string;
  direction: "income" | "expense";
  occurrenceCount: number;
  observedDayRange: readonly [number, number];
  amountBand: "small" | "medium" | "large";
  nominalDate: string;
  matchedSignals: readonly ForecastSignal[];
  nonBusinessDates?: readonly string[];
}

export interface ForecastClassificationDecision {
  label: ForecastClassification;
  confidence: number;
  reason: string;
  source: "rule" | "llm";
}

export interface ForecastDateCandidate {
  date: string;
  adjustment: ForecastDateAdjustment;
}

export interface ForecastLLMDecision {
  candidateId: string;
  classification: ForecastClassification;
  confidence: number;
  reason: string;
  dateAdjustment: ForecastDateAdjustment;
}

export type ForecastLLMDecider = (
  candidate: ForecastCandidateFeatures,
  dateCandidates: readonly ForecastDateCandidate[],
) => Promise<ForecastLLMDecision | null>;

export interface AssistedForecastCandidate {
  candidateId: string;
  classification: ForecastClassificationDecision;
  dateCandidates: ForecastDateCandidate[];
  suggestedDateAdjustment: ForecastDateAdjustment | null;
  reviewRequired: boolean;
  reviewReason: string | null;
}

const signalPriority: readonly ForecastSignal[] = ["salary", "card_payment", "rent", "loan", "tax"];

const minimumLLMConfidence = 0.6;
const defaultLLMTimeoutMs = 5_000;

function isClassificationCompatible(
  direction: ForecastCandidateFeatures["direction"],
  classification: ForecastClassification,
): boolean {
  if (classification === "other") return true;
  return classification === "salary" ? direction === "income" : direction === "expense";
}

function isBusinessDay(date: string, nonBusinessDates: ReadonlySet<string>): boolean {
  const dayOfWeek = getDayOfWeekIsoDateKey(date);
  return dayOfWeek !== 0 && dayOfWeek !== 6 && !nonBusinessDates.has(date);
}

function findBusinessDay(
  nominalDate: string,
  direction: -1 | 1,
  nonBusinessDates: ReadonlySet<string>,
): string {
  let date = nominalDate;
  do {
    date = addDaysToIsoDateKey(date, direction);
  } while (!isBusinessDay(date, nonBusinessDates));
  return date;
}

export function getBusinessDayShiftCandidates(
  nominalDate: string,
  nonBusinessDates: readonly string[] = [],
): ForecastDateCandidate[] {
  parseIsoDateKey(nominalDate);
  const excludedDates = new Set(nonBusinessDates);

  if (isBusinessDay(nominalDate, excludedDates)) {
    return [{ date: nominalDate, adjustment: "none" }];
  }

  return [
    {
      date: findBusinessDay(nominalDate, -1, excludedDates),
      adjustment: "previous_business_day",
    },
    {
      date: findBusinessDay(nominalDate, 1, excludedDates),
      adjustment: "next_business_day",
    },
  ];
}

function createRuleClassification(
  candidate: ForecastCandidateFeatures,
): ForecastClassificationDecision {
  const label = signalPriority.find(
    (signal) =>
      candidate.matchedSignals.includes(signal) &&
      isClassificationCompatible(candidate.direction, signal),
  );
  if (!label) {
    return {
      label: "other",
      confidence: 0,
      reason: "ルールに一致する分類シグナルがありません。",
      source: "rule",
    };
  }

  const occurrenceConfidence = candidate.occurrenceCount >= 3 ? 0.9 : 0.6;
  return {
    label,
    confidence: candidate.occurrenceCount === 1 ? 0.35 : occurrenceConfidence,
    reason: `匿名化済みの${label}シグナルと過去${candidate.occurrenceCount}回の出現に基づく分類です。`,
    source: "rule",
  };
}

function createDateCandidates(
  candidate: ForecastCandidateFeatures,
  classification: ForecastClassification,
): ForecastDateCandidate[] {
  if (classification !== "salary") {
    return [{ date: candidate.nominalDate, adjustment: "none" }];
  }

  return getBusinessDayShiftCandidates(candidate.nominalDate, candidate.nonBusinessDates);
}

function createLLMDateCandidates(candidate: ForecastCandidateFeatures): ForecastDateCandidate[] {
  const nominalCandidate: ForecastDateCandidate = {
    date: candidate.nominalDate,
    adjustment: "none",
  };
  const salaryCandidates = createDateCandidates(candidate, "salary");
  return [
    nominalCandidate,
    ...salaryCandidates.filter(({ adjustment }) => adjustment !== nominalCandidate.adjustment),
  ];
}

function isValidLLMDecision(
  decision: ForecastLLMDecision,
  candidate: ForecastCandidateFeatures,
  dateCandidates: readonly ForecastDateCandidate[],
): boolean {
  if (decision.candidateId !== candidate.candidateId) return false;
  if (decision.classification === "other" || decision.confidence < minimumLLMConfidence) {
    return false;
  }
  if (!isClassificationCompatible(candidate.direction, decision.classification)) return false;
  const adjustmentWasOffered = dateCandidates.some(
    ({ adjustment }) => adjustment === decision.dateAdjustment,
  );
  const adjustmentMatchesClassification = createDateCandidates(
    candidate,
    decision.classification,
  ).some(({ adjustment }) => adjustment === decision.dateAdjustment);
  return adjustmentWasOffered && adjustmentMatchesClassification;
}

export async function generateForecastAssistanceWithLLM(
  candidate: ForecastCandidateFeatures,
  dateCandidates: readonly ForecastDateCandidate[],
): Promise<ForecastLLMDecision | null> {
  if (!isLLMEnabled()) return null;

  const result = await generateText({
    model: getModel(),
    output: Output.object({ schema: forecastLLMDecisionSchema }),
    system:
      "あなたは今月の銀行入出金予測候補を補助分類します。入力は匿名化済み特徴量です。分類・信頼度・短い根拠と候補内の日付調整だけを返し、金額計算や予測採否は行いません。",
    prompt: `次の匿名化済みJSONを分類してください。direction、matchedSignals、出現回数、日付範囲、金額帯だけを根拠にし、dateAdjustmentはdateCandidatesに存在する値を選んでください。\n\n${JSON.stringify(
      {
        candidate: {
          candidateId: candidate.candidateId,
          direction: candidate.direction,
          occurrenceCount: candidate.occurrenceCount,
          observedDayRange: candidate.observedDayRange,
          amountBand: candidate.amountBand,
          matchedSignals: candidate.matchedSignals,
        },
        dateCandidates,
      },
      null,
      2,
    )}`,
  });

  const parsed = forecastLLMDecisionSchema.safeParse(result.output);
  if (!parsed.success || !isValidLLMDecision(parsed.data, candidate, dateCandidates)) {
    return null;
  }
  return parsed.data;
}

function requestLLMDecision(
  request: Promise<ForecastLLMDecision | null>,
  timeoutMs: number,
): Promise<ForecastLLMDecision | null> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve(null), timeoutMs);
    request.then(
      (decision) => {
        clearTimeout(timeout);
        resolve(decision);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export async function assistForecastCandidate(
  candidate: ForecastCandidateFeatures,
  llmDecider: ForecastLLMDecider = generateForecastAssistanceWithLLM,
  llmTimeoutMs = defaultLLMTimeoutMs,
): Promise<AssistedForecastCandidate> {
  const ruleClassification = createRuleClassification(candidate);
  const llmDateCandidates = createLLMDateCandidates(candidate);

  let llmDecision: ForecastLLMDecision | null = null;
  try {
    llmDecision = await requestLLMDecision(llmDecider(candidate, llmDateCandidates), llmTimeoutMs);
  } catch {
    // The forecast must remain available when the optional LLM fails.
  }

  if (llmDecision && !isValidLLMDecision(llmDecision, candidate, llmDateCandidates)) {
    llmDecision = null;
  }

  const classification = llmDecision?.classification ?? ruleClassification.label;
  const dateCandidates = createDateCandidates(candidate, classification);

  const isNewLargeIncome =
    candidate.direction === "income" &&
    candidate.occurrenceCount === 1 &&
    candidate.amountBand === "large";

  return {
    candidateId: candidate.candidateId,
    classification: llmDecision
      ? {
          label: llmDecision.classification,
          confidence: llmDecision.confidence,
          reason: llmDecision.reason,
          source: "llm",
        }
      : ruleClassification,
    dateCandidates,
    suggestedDateAdjustment: llmDecision?.dateAdjustment ?? null,
    reviewRequired: isNewLargeIncome,
    reviewReason: isNewLargeIncome
      ? "直近1回のみ確認された新規の大口入金候補のため、予測への採用前に確認が必要です。"
      : null,
  };
}
