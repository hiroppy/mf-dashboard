import { tool } from "ai";
import { z } from "zod";
import { buildFinanceChatHref } from "./cards";

const navigationInputSchema = z.discriminatedUnion("page", [
  z.object({ page: z.literal("dashboard") }),
  z.object({
    page: z.literal("cashFlow"),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
  }),
  z.object({ page: z.literal("balanceSheet") }),
  z.object({ page: z.literal("accounts") }),
  z.object({ page: z.literal("insights") }),
  z.object({ page: z.literal("simulator") }),
]);

export function createFinanceNavigationTool(groupId: string) {
  return tool({
    description:
      "回答カードのCTAに使う現在グループ内の安全なダッシュボードURLを取得する。presentFinanceCardsへhrefを渡す前に呼び出す",
    inputSchema: navigationInputSchema,
    execute: async (route) => {
      switch (route.page) {
        case "dashboard":
          return { href: buildFinanceChatHref({ page: route.page, groupId }) };
        case "cashFlow":
          return {
            href: buildFinanceChatHref({ page: route.page, groupId, month: route.month }),
          };
        case "balanceSheet":
        case "accounts":
        case "insights":
        case "simulator":
          return { href: buildFinanceChatHref({ page: route.page, groupId }) };
      }
    },
  });
}
