import { tool } from "ai";
import { z } from "zod";

const navigationInputSchema = z.object({
  page: z.enum(["dashboard", "cashFlow", "balanceSheet", "accounts", "insights", "simulator"]),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .describe("cashFlowページの対象月 (YYYY-MM形式)"),
});

const routeSegmentSchema = z
  .string()
  .min(1)
  .refine((segment) => {
    try {
      const decoded = decodeURIComponent(segment);
      return decoded !== "." && decoded !== ".." && !/[/?#\\\\]/.test(decoded);
    } catch {
      return false;
    }
  });
const topLevelPages = new Set(["accounts", "bs", "cf", "insights", "simulator"]);

export function isFinanceChatHrefSafe(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("?") || href.includes("#")) {
    return false;
  }

  const segments = href.split("/").slice(1);
  if (segments.at(-1) === "") segments.pop();
  if (!segments.every((segment) => routeSegmentSchema.safeParse(segment).success)) return false;

  if (segments.length === 1) return !topLevelPages.has(segments[0]!);
  if (topLevelPages.has(segments[0]!)) return false;

  const page = segments[1];
  const detail = segments[2];
  if (!page || !topLevelPages.has(page)) return false;
  if (!detail) return segments.length === 2;

  return page === "cf" && segments.length === 3 && /^\d{4}-(0[1-9]|1[0-2])$/.test(detail);
}

export const financeChatHrefSchema = z
  .string()
  .refine(isFinanceChatHrefSafe, "Only supported internal dashboard routes are allowed");

export function buildFinanceChatHref({
  groupId,
  month,
  page,
}: {
  groupId: string;
  month?: string;
  page: z.infer<typeof navigationInputSchema>["page"];
}): string {
  const base = `/${encodeURIComponent(groupId)}`;

  switch (page) {
    case "dashboard":
      return base;
    case "cashFlow":
      return month ? `${base}/cf/${month}` : `${base}/cf`;
    case "balanceSheet":
      return `${base}/bs`;
    case "accounts":
    case "insights":
    case "simulator":
      return `${base}/${page}`;
  }
}

export function createFinanceNavigationTool(groupId: string) {
  return tool({
    description:
      "回答本文のMarkdownリンクに使う現在グループ内のURLを取得する。収支・収入・支出・取引・カテゴリはcashFlow、資産・負債・保有銘柄はbalanceSheet、口座はaccounts、分析はinsights、シミュレーションはsimulator、概要画面はdashboardを指定する。返されたhrefは変更せずに使う",
    inputSchema: navigationInputSchema,
    execute: async (route) => {
      const href = buildFinanceChatHref({ ...route, groupId });
      return { href };
    },
  });
}
