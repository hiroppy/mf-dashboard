import type { ZodObject } from "zod";
import { createFinancialTools, createAnalysisTools } from "@mf-dashboard/analytics";
import { getDb, getCurrentGroup } from "@mf-dashboard/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main() {
  const db = getDb();
  const group = await getCurrentGroup(db);

  if (!group) {
    console.error("No current group found in database");
    process.exit(1);
  }

  const server = new McpServer({
    name: "moneyforward-dashboard",
    version: "1.0.0",
  });

  const allTools = {
    ...createFinancialTools(db, group.id),
    ...createAnalysisTools(db, group.id),
  };

  for (const [name, t] of Object.entries(allTools)) {
    const { description, inputSchema, execute } = t as unknown as {
      description: string;
      inputSchema: ZodObject<Record<string, never>>;
      execute: (input: Record<string, unknown>) => Promise<unknown>;
    };

    server.registerTool(name, { description, inputSchema }, async (params) => {
      const result = await execute(params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    });
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main();
