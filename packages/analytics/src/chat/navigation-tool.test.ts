import { describe, expect, it } from "vitest";
import { createFinanceNavigationTool } from "./navigation-tool";

const execOptions = {
  toolCallId: "test",
  messages: [],
  abortSignal: undefined as never,
  context: {} as never,
};

describe("createFinanceNavigationTool", () => {
  it("builds a group-scoped cash-flow route", async () => {
    const tool = createFinanceNavigationTool("group-a");

    await expect(
      tool.execute?.({ page: "cashFlow", month: "2026-06" }, execOptions),
    ).resolves.toEqual({ href: "/group-a/cf/2026-06" });
  });

  it("builds a group-scoped balance-sheet route", async () => {
    const tool = createFinanceNavigationTool("group-a");

    await expect(tool.execute?.({ page: "balanceSheet" }, execOptions)).resolves.toEqual({
      href: "/group-a/bs",
    });
  });
});
