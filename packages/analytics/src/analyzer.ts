import { getJstTodayIsoDate } from "@mf-dashboard/date-utils";
import type { Db } from "@mf-dashboard/db";
import { saveAnalyticsReport } from "@mf-dashboard/db/repository/analytics";
import { isLLMEnabled } from "./config.js";
import { generateInsightsWithMetadata } from "./insights/generator.js";

export async function analyzeFinancialData(db: Db, groupId: string): Promise<boolean> {
  let insights = null;
  let model = null;
  if (isLLMEnabled()) {
    try {
      const generated = await generateInsightsWithMetadata(db, groupId);
      insights = generated.insights;
      model = generated.model;
    } catch (error) {
      console.warn("[analytics] LLM insights generation failed:", error);
    }
  }

  if (!insights || !Object.values(insights).some((v) => v !== null)) {
    console.log("[analytics] No LLM insights generated, skipping save");
    return false;
  }

  const today = getJstTodayIsoDate();

  await saveAnalyticsReport(db, {
    groupId,
    date: today,
    insights,
    model,
  });

  console.log("[analytics] LLM insights saved");
  return true;
}
