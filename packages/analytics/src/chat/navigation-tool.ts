import { tool } from "ai";
import { z } from "zod";
import { buildFinanceChatHref } from "./cards";

const navigationInputSchema = z.object({
  page: z.enum(["dashboard", "cashFlow", "balanceSheet", "accounts", "insights", "simulator"]),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .describe("cashFlowページの対象月 (YYYY-MM形式)"),
});

export function createFinanceNavigationTool(groupId: string, allowedHrefs?: Set<string>) {
  return tool({
    description:
      "回答本文とカードのCTAに使う現在グループ内のURLを取得する。収支・収入・支出・取引・カテゴリはcashFlow、資産・負債・保有銘柄はbalanceSheet、口座はaccounts、分析はinsights、シミュレーションはsimulator、概要画面はdashboardを指定する。返されたhrefは変更せずに使う",
    inputSchema: navigationInputSchema,
    execute: async (route) => {
      let href: string;

      switch (route.page) {
        case "dashboard":
          href = buildFinanceChatHref({ page: route.page, groupId });
          break;
        case "cashFlow":
          href = buildFinanceChatHref({ page: route.page, groupId, month: route.month });
          break;
        case "balanceSheet":
        case "accounts":
        case "insights":
        case "simulator":
          href = buildFinanceChatHref({ page: route.page, groupId });
          break;
      }

      allowedHrefs?.add(href);
      return { href };
    },
  });
}
