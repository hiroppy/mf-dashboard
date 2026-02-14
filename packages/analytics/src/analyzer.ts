import type { Db } from "@mf-dashboard/db";
import { saveAnalyticsReport } from "@mf-dashboard/db/repository/analytics";
import { isLLMEnabled } from "./config.js";
import { generateInsights } from "./insights/generator.js";

export async function analyzeFinancialData(db: Db, groupId: string): Promise<boolean> {
  let insights = null;
  if (isLLMEnabled()) {
    try {
      insights = await generateInsights(db, groupId);
    } catch (error) {
      console.warn("[analytics] LLM insights generation failed:", error);
    }
  }

  if (!insights || !Object.values(insights).some((v) => v !== null)) {
    console.log("[analytics] No LLM insights generated, skipping save");
    return false;
  }

  const today = new Date().toISOString().split("T")[0];

  await saveAnalyticsReport(db, {
    groupId,
    date: today,
    insights,
    model: process.env.AI_MODEL ?? null,
  });

  console.log("[analytics] LLM insights saved");
  return true;
}
