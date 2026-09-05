import type { Db } from "@mf-dashboard/db";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMcpServer, startMcpServer } from "./server.js";

const executeFinancialTool = vi.fn<
  ({ month }: { month: string }) => Promise<{ month: string; expense: number }>
>(async ({ month }) => ({ month, expense: 1200 }));
const executeEmptyTool = vi.fn<() => Promise<undefined>>(async () => undefined);
const executeAnalysisTool = vi.fn<() => Promise<{ trend: string }>>(async () => ({
  trend: "stable",
}));
const financialToolGroupIds: string[] = [];

vi.mock("@mf-dashboard/analytics/insights/tools", () => ({
  createFinancialTools: (_db: Db, groupId: string) => {
    financialToolGroupIds.push(groupId);

    return {
      getMonthlySummaryByMonth: {
        description: "指定月の収支サマリーを取得",
        inputSchema: z.object({ month: z.string() }),
        execute: executeFinancialTool,
      },
      getLatestMonthlySummary: {
        description: "最新月の収支サマリーを取得",
        inputSchema: z.object({}),
        execute: executeEmptyTool,
      },
    };
  },
}));

vi.mock("@mf-dashboard/analytics/insights/analysis-tools", () => ({
  createAnalysisTools: () => ({
    analyzeMoMTrend: {
      description: "月次収支の前月比トレンドを分析",
      inputSchema: z.object({}),
      execute: executeAnalysisTool,
    },
  }),
}));

function createDbWithCurrentGroup(groupId?: string) {
  let currentGroupId = groupId;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => (currentGroupId ? { id: currentGroupId } : undefined),
        }),
      }),
    }),
  } as unknown as Db;

  return {
    db,
    setCurrentGroup: (nextGroupId?: string) => {
      currentGroupId = nextGroupId;
    },
  };
}

async function connectClient(server: ReturnType<typeof createMcpServer>) {
  const client = new Client({ name: "mcp-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return client;
}

afterEach(() => {
  vi.clearAllMocks();
  financialToolGroupIds.length = 0;
});

describe("createMcpServer", () => {
  it("financial toolsとanalysis toolsを公開する", async () => {
    const client = await connectClient(createMcpServer({} as Db, "group-a"));

    const result = await client.listTools();

    expect(result.tools.map(({ name }) => name)).toEqual([
      "getMonthlySummaryByMonth",
      "getLatestMonthlySummary",
      "analyzeMoMTrend",
    ]);
    await client.close();
  });

  it("toolの実行結果をJSON text contentとして返す", async () => {
    const { db } = createDbWithCurrentGroup("group-a");
    const client = await connectClient(createMcpServer(db, "group-a"));

    const result = await client.callTool({
      name: "getMonthlySummaryByMonth",
      arguments: { month: "2026-08" },
    });

    expect(executeFinancialTool).toHaveBeenCalledWith({ month: "2026-08" });
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ month: "2026-08", expense: 1200 }, null, 2),
      },
    ]);
    await client.close();
  });

  it("データがないtoolの実行結果をnullとして返す", async () => {
    const { db } = createDbWithCurrentGroup("group-a");
    const client = await connectClient(createMcpServer(db, "group-a"));

    const result = await client.callTool({
      name: "getLatestMonthlySummary",
      arguments: {},
    });

    expect(result.content).toEqual([{ type: "text", text: "null" }]);
    await client.close();
  });

  it("tool callごとに現在グループを再解決する", async () => {
    const { db, setCurrentGroup } = createDbWithCurrentGroup("group-a");
    const client = await connectClient(createMcpServer(db, "group-a"));
    setCurrentGroup("group-b");

    await client.callTool({
      name: "getLatestMonthlySummary",
      arguments: {},
    });

    expect(financialToolGroupIds).toEqual(["group-a", "group-b"]);
    await client.close();
  });

  it("tool call時に現在グループがない場合はエラーを返す", async () => {
    const { db, setCurrentGroup } = createDbWithCurrentGroup("group-a");
    const client = await connectClient(createMcpServer(db, "group-a"));
    setCurrentGroup();

    const result = await client.callTool({
      name: "getLatestMonthlySummary",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(executeEmptyTool).not.toHaveBeenCalled();
    await client.close();
  });

  it("必須入力がない場合はtoolを実行せずにエラーを返す", async () => {
    const client = await connectClient(createMcpServer({} as Db, "group-a"));

    const result = await client.callTool({
      name: "getMonthlySummaryByMonth",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(executeFinancialTool).not.toHaveBeenCalled();
    await client.close();
  });
});

describe("startMcpServer", () => {
  it("現在グループがない場合は接続せずに失敗する", async () => {
    const [, serverTransport] = InMemoryTransport.createLinkedPair();
    const { db } = createDbWithCurrentGroup();

    await expect(startMcpServer(db, serverTransport)).rejects.toThrow(
      "No current group found in database",
    );
  });
});
