/**
 * デモDB用のインサイトを LLM で生成し、JSON ファイルに保存するスクリプト
 *
 * 使い方:
 *   DB_PATH=../../data/demo.db AI_PROVIDER=openai AI_MODEL=gpt-4o-mini AI_API_KEY=sk-xxx \
 *     pnpm --filter @moneyforward-daily-action/analytics generate:demo-insights
 */

import { getDb } from "@moneyforward-daily-action/db";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateInsights } from "../src/insights/generator.js";

const GROUP_IDS = ["0", "demo_group_001", "demo_group_002"];

const db = getDb();

const results: Record<string, Record<string, string | null>> = {};
for (const groupId of GROUP_IDS) {
  console.log(`Generating insights for group: ${groupId}`);
  results[groupId] = await generateInsights(db, groupId);
  console.log(`Done: ${groupId}`);
}

const outPath = join(import.meta.dirname, "../../db/src/fixtures/demo-insights.json");
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`Saved to ${outPath}`);
