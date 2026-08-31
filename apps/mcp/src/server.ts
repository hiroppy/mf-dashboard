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

export function createMcpServer(db: Db, groupId: string) {
  const server = new McpServer({
    name: "moneyforward-dashboard",
    version: "1.0.0",
  });
  const tools = {
    ...createFinancialTools(db, groupId),
    ...createAnalysisTools(db, groupId),
  };

  for (const [name, tool] of Object.entries(tools)) {
    const { description, inputSchema, execute } = tool as unknown as AnalyticsTool;

    server.registerTool(name, { description, inputSchema }, async (input) => {
      const result = await execute(input);
      const text = JSON.stringify(result, null, 2) ?? "null";

      return {
        content: [{ type: "text", text }],
      };
    });
  }

  return server;
}

export async function startMcpServer(db: Db, transport: Parameters<McpServer["connect"]>[0]) {
  const group = await getCurrentGroup(db);

  if (!group) {
    throw new Error("No current group found in database");
  }

  const server = createMcpServer(db, group.id);
  await server.connect(transport);

  return server;
}
