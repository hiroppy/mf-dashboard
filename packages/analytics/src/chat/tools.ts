import type { Db } from "@mf-dashboard/db";
import { tool } from "ai";
import { financeChartSchema } from "./chart";
import { createDatabaseQueryTool } from "./database-query-tool";
import { createFinanceNavigationTool } from "./navigation-tool";

export function createFinanceChatTools(db: Db, groupId: string) {
  return {
    queryDatabase: createDatabaseQueryTool(db, groupId),
    presentChart: tool({
      description:
        "取得済みの家計データを画面上のグラフとして表示する。時系列はline、項目比較はbar、単一系列の構成比はpieを使用する。画像や文字による簡易グラフではなく、このツールを使用する",
      inputSchema: financeChartSchema,
      execute: async (chart) => chart,
    }),
    getFinanceDashboardRoute: createFinanceNavigationTool(groupId),
  };
}
