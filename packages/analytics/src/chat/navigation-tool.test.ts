import { describe, expect, it } from "vitest";
import {
  createFinanceNavigationTool,
  financeChatHrefSchema,
  isFinanceChatHrefSafe,
} from "./navigation-tool";

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

  it.each(["/group-a", "/group-a/cf", "/group-a/cf/2026-06", "/group-a/bs", "/group-a/accounts"])(
    "allows a supported group route: %s",
    (href) => {
      expect(isFinanceChatHrefSafe(href)).toBe(true);
      expect(financeChatHrefSchema.safeParse(href).success).toBe(true);
    },
  );

  it.each([
    "//example.com",
    "/cf",
    "/group-a/unknown",
    "/group-a/cf/2026-13",
    "/group-a/%2e%2e/accounts",
    "/group-a/accounts?tab=all",
  ])("rejects an unsafe or unsupported route: %s", (href) => {
    expect(isFinanceChatHrefSafe(href)).toBe(false);
    expect(financeChatHrefSchema.safeParse(href).success).toBe(false);
  });
});
