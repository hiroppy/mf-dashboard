import type { Db } from "@mf-dashboard/db";
import { describe, expect, it } from "vitest";
import { createFinanceChatTools } from "./tools.js";

const db = {} as Db;
const groupId = "test-group";
const execOptions = {
  toolCallId: "test",
  messages: [],
  abortSignal: undefined as never,
  context: {} as never,
};

describe("createFinanceChatTools", () => {
  it("exposes one general database tool and validated navigation", () => {
    const tools = createFinanceChatTools(db, groupId);

    expect(Object.keys(tools)).toEqual([
      "queryDatabase",
      "presentChart",
      "getFinanceDashboardRoute",
    ]);
    expect(tools.presentChart.description).toContain("25%は0.25ではなく25");
  });

  it("limits total tool calls across the tool set", async () => {
    const tools = createFinanceChatTools(db, groupId);
    const chart = {
      title: "支出",
      chartType: "bar" as const,
      series: [{ name: "支出", amountType: "expense" as const }],
      data: [{ label: "7月", values: [1000] }],
    };

    for (let index = 0; index < 8; index += 1) {
      await expect(tools.presentChart.execute?.(chart, execOptions)).resolves.toEqual(chart);
    }
    await expect(tools.presentChart.execute?.(chart, execOptions)).rejects.toThrow("最大8回まで");
  });
});
