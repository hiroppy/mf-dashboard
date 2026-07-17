import { z } from "zod";

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
  }, "Invalid route segment");

const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const topLevelPages = new Set(["accounts", "bs", "cf", "insights", "simulator"]);

export function isFinanceChatHrefSafe(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("?") || href.includes("#")) {
    return false;
  }

  const segments = href.split("/").slice(1);
  if (segments.at(-1) === "") segments.pop();
  if (!segments.every((segment) => routeSegmentSchema.safeParse(segment).success)) return false;

  if (segments.length <= 1) return true;

  const pageIndex = topLevelPages.has(segments[0]) ? 0 : 1;
  const page = segments[pageIndex];
  const detail = segments[pageIndex + 1];

  if (!page || !topLevelPages.has(page)) return false;
  if (!detail) return segments.length === pageIndex + 1;
  if (segments.length !== pageIndex + 2) return false;

  if (page === "cf") return yearMonthSchema.safeParse(detail).success;
  return page === "accounts";
}

export const financeChatHrefSchema = z
  .string()
  .refine(isFinanceChatHrefSafe, "Only supported internal dashboard routes are allowed");

const amountTypeSchema = z.enum(["income", "expense", "balance"]);
const finiteAmountSchema = z.number().finite();
const actionSchema = z.object({
  label: z.string().min(1),
  href: financeChatHrefSchema,
});
const linkableCardSchema = z.object({
  href: financeChatHrefSchema.optional(),
});

export const summaryCardSchema = z
  .object({
    type: z.literal("summary"),
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    metrics: z
      .array(
        z.object({
          label: z.string().min(1),
          amount: finiteAmountSchema,
          amountType: amountTypeSchema,
        }),
      )
      .min(1),
  })
  .extend(linkableCardSchema.shape);

export const transactionListCardSchema = z
  .object({
    type: z.literal("transactionList"),
    title: z.string().min(1),
    transactions: z
      .array(
        z.object({
          id: z.string().min(1),
          date: z.iso.date(),
          description: z.string().min(1),
          category: z.string().min(1).optional(),
          amount: finiteAmountSchema,
          amountType: z.enum(["income", "expense"]),
        }),
      )
      .min(1),
  })
  .extend(linkableCardSchema.shape);

export const categoryBreakdownCardSchema = z
  .object({
    type: z.literal("categoryBreakdown"),
    title: z.string().min(1),
    categories: z
      .array(
        z.object({
          name: z.string().min(1),
          amount: finiteAmountSchema,
          amountType: z.enum(["income", "expense"]),
          percentage: z.number().min(0).max(100),
        }),
      )
      .min(1),
  })
  .extend(linkableCardSchema.shape);

export const insightCardSchema = z
  .object({
    type: z.literal("insight"),
    title: z.string().min(1),
    description: z.string().min(1),
    amount: finiteAmountSchema.optional(),
    amountType: amountTypeSchema.optional(),
    action: actionSchema.optional(),
  })
  .refine((card) => (card.amount === undefined) === (card.amountType === undefined), {
    message: "Insight amount and amountType must be provided together",
  });

export const actionCardSchema = z.object({
  type: z.literal("action"),
  title: z.string().min(1),
  description: z.string().min(1),
  action: actionSchema,
});

export const financeChatCardSchema = z.discriminatedUnion("type", [
  summaryCardSchema,
  transactionListCardSchema,
  categoryBreakdownCardSchema,
  insightCardSchema,
  actionCardSchema,
]);

export type FinanceChatCard = z.infer<typeof financeChatCardSchema>;
export type SummaryCard = z.infer<typeof summaryCardSchema>;
export type TransactionListCard = z.infer<typeof transactionListCardSchema>;
export type CategoryBreakdownCard = z.infer<typeof categoryBreakdownCardSchema>;
export type InsightCard = z.infer<typeof insightCardSchema>;
export type ActionCard = z.infer<typeof actionCardSchema>;

type FinanceChatRoute =
  | { page: "dashboard"; groupId?: string }
  | { page: "cashFlow"; groupId?: string; month?: string }
  | { page: "balanceSheet"; groupId?: string }
  | { page: "accounts"; groupId?: string; accountId?: string }
  | { page: "insights"; groupId?: string }
  | { page: "simulator"; groupId?: string };

function encodeRouteSegment(segment: string): string {
  return encodeURIComponent(routeSegmentSchema.parse(segment));
}

export function buildFinanceChatHref(route: FinanceChatRoute): string {
  const segments = route.groupId === undefined ? [] : [encodeRouteSegment(route.groupId)];

  switch (route.page) {
    case "dashboard":
      break;
    case "cashFlow":
      segments.push("cf");
      if (route.month !== undefined) segments.push(yearMonthSchema.parse(route.month));
      break;
    case "balanceSheet":
      segments.push("bs");
      break;
    case "accounts":
      segments.push("accounts");
      if (route.accountId !== undefined) segments.push(encodeRouteSegment(route.accountId));
      break;
    case "insights":
      segments.push("insights");
      break;
    case "simulator":
      segments.push("simulator");
      break;
  }

  return financeChatHrefSchema.parse(`/${segments.join("/")}`);
}
