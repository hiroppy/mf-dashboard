import type { Db } from "@mf-dashboard/db";
import { tool } from "ai";
import { financeChartSchema } from "./chart";
import { createDatabaseQueryTool } from "./database-query-tool";
import { createFinanceNavigationTool } from "./navigation-tool";

const MAX_TOOL_CALLS = 8;

export function createFinanceChatTools(db: Db, groupId: string) {
  let toolCallCount = 0;
  const countToolCall = () => {
    toolCallCount += 1;
    if (toolCallCount > MAX_TOOL_CALLS) {
      throw new Error(`ツールは1回の回答につき最大${MAX_TOOL_CALLS}回まで実行できます。`);
    }
  };

  return {
    queryDatabase: createDatabaseQueryTool(db, groupId, countToolCall),
    presentChart: tool({
      description:
        "取得済みの家計データを画面上のグラフとして表示する。時系列はline、項目比較はbar、単一系列の構成比はpieを使用する。金額はunit=currency、件数はcount、割合はpercentを指定する。負債残高のseriesはamountType=liabilityを指定する。画像や文字による簡易グラフではなく、このツールを使用する",
      inputSchema: financeChartSchema,
      execute: async (chart) => {
        countToolCall();
        return chart;
      },
    }),
    getFinanceDashboardRoute: createFinanceNavigationTool(groupId, countToolCall),
  };
}
