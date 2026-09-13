import { getDb } from "@mf-dashboard/db";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { assertDatabasePathConfigured } from "./config.js";
import { startMcpServer } from "./server.js";

async function main() {
  assertDatabasePathConfigured();
  await startMcpServer(getDb(), new StdioServerTransport());
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
