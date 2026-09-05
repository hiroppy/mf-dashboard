import { createAnalysisTools } from "@mf-dashboard/analytics/insights/analysis-tools";
import { createFinancialTools } from "@mf-dashboard/analytics/insights/tools";
import { getCurrentGroup, type Db } from "@mf-dashboard/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodObject, ZodRawShape } from "zod";

type AnalyticsTool = {
  description: string;
  inputSchema: ZodObject<ZodRawShape>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

function createAnalyticsTools(db: Db, groupId: string) {
  return {
    ...createFinancialTools(db, groupId),
    ...createAnalysisTools(db, groupId),
  };
}

async function getRequiredCurrentGroup(db: Db) {
  const group = await getCurrentGroup(db);

  if (!group) {
    throw new Error("No current group found in database");
  }

  return group;
}

export function createMcpServer(db: Db, initialGroupId: string) {
  const server = new McpServer({
    name: "moneyforward-dashboard",
    version: "1.0.0",
  });
  const tools = createAnalyticsTools(db, initialGroupId);

  for (const [name, tool] of Object.entries(tools)) {
    const { description, inputSchema } = tool as unknown as AnalyticsTool;

    server.registerTool(name, { description, inputSchema }, async (input) => {
      const group = await getRequiredCurrentGroup(db);
      const currentTools = createAnalyticsTools(db, group.id) as unknown as Record<
        string,
        AnalyticsTool
      >;
      const currentTool = currentTools[name];

      if (!currentTool) {
        throw new Error(`Tool no longer available: ${name}`);
      }

      const result = await currentTool.execute(input);
      const text = JSON.stringify(result, null, 2) ?? "null";

      return {
        content: [{ type: "text", text }],
      };
    });
  }

  return server;
}

export async function startMcpServer(db: Db, transport: Parameters<McpServer["connect"]>[0]) {
  const group = await getRequiredCurrentGroup(db);
  const server = createMcpServer(db, group.id);
  await server.connect(transport);

  return server;
}
