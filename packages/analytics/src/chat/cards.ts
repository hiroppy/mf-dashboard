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
const groupIdSchema = routeSegmentSchema.refine(
  (groupId) => !topLevelPages.has(groupId),
  "Reserved route segment",
);

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

const chartSeriesSchema = z.object({
  name: z.string().min(1),
  amountType: amountTypeSchema,
});

export const chartCardSchema = z
  .object({
    type: z.literal("chart"),
    title: z.string().min(1),
    chartType: z.enum(["line", "bar", "pie"]),
    series: z.array(chartSeriesSchema).min(1).max(3),
    data: z
      .array(
        z.object({
          label: z.string().min(1),
          values: z.array(finiteAmountSchema).min(1).max(3),
        }),
      )
      .min(1)
      .max(24),
  })
  .extend(linkableCardSchema.shape)
  .superRefine((card, context) => {
    if (new Set(card.series.map((series) => series.name)).size !== card.series.length) {
      context.addIssue({
        code: "custom",
        message: "Chart series names must be unique",
        path: ["series"],
      });
    }
    if (new Set(card.data.map((point) => point.label)).size !== card.data.length) {
      context.addIssue({
        code: "custom",
        message: "Chart data labels must be unique",
        path: ["data"],
      });
    }
    if (card.chartType === "pie" && card.series.length !== 1) {
      context.addIssue({ code: "custom", message: "Pie charts support exactly one series" });
    }
    if (card.chartType === "pie" && card.data.length > 5) {
      context.addIssue({ code: "custom", message: "Pie charts support at most five data points" });
    }
    if (
      card.chartType === "pie" &&
      card.data.some((point) => point.values.some((value) => value < 0))
    ) {
      context.addIssue({ code: "custom", message: "Pie chart values must be non-negative" });
    }
    if (
      card.chartType === "pie" &&
      !card.data.some((point) => point.values.some((value) => value > 0))
    ) {
      context.addIssue({ code: "custom", message: "Pie charts require a positive value" });
    }
    if (card.data.some((point) => point.values.length !== card.series.length)) {
      context.addIssue({ code: "custom", message: "Each data point must match the series count" });
    }
  });

export const insightCardSchema = z
  .object({
    type: z.literal("insight"),
    title: z.string().min(1),
    description: z.string().min(1),
    amount: finiteAmountSchema.optional(),
    amountLabel: z.string().min(1).optional(),
    amountType: amountTypeSchema.optional(),
    action: actionSchema.optional(),
  })
  .refine(
    (card) =>
      (card.amount === undefined) === (card.amountType === undefined) &&
      (card.amount === undefined) === (card.amountLabel === undefined),
    {
      message: "Insight amount, amountLabel, and amountType must be provided together",
    },
  );

export const actionCardSchema = z.object({
  type: z.literal("action"),
  title: z.string().min(1),
  description: z.string().min(1),
  action: actionSchema,
});

export const emptyCardSchema = z.object({
  type: z.literal("empty"),
  title: z.string().min(1),
  description: z.string().min(1),
  prompts: z.array(z.string().min(1)).min(1).max(3),
});

export const financeChatCardSchema = z.discriminatedUnion("type", [
  summaryCardSchema,
  transactionListCardSchema,
  categoryBreakdownCardSchema,
  chartCardSchema,
  insightCardSchema,
  actionCardSchema,
  emptyCardSchema,
]);

export const financeChatCardsSchema = z
  .array(financeChatCardSchema)
  .min(1)
  .max(6)
  .superRefine((cards, context) => {
    const hasEmptyCard = cards.some((card) => card.type === "empty");

    if (hasEmptyCard && (cards.length !== 1 || cards[0]?.type !== "empty")) {
      context.addIssue({
        code: "custom",
        message: "An empty response must contain exactly one empty card",
      });
      return;
    }

    const hasAction = cards.some((card) => {
      if ("href" in card && card.href !== undefined) return true;
      return "action" in card && card.action !== undefined;
    });

    if (!hasEmptyCard && !hasAction) {
      context.addIssue({
        code: "custom",
        message: "A non-empty response must contain at least one CTA",
      });
    }
  });

export type FinanceChatCard = z.infer<typeof financeChatCardSchema>;
export type SummaryCard = z.infer<typeof summaryCardSchema>;
export type TransactionListCard = z.infer<typeof transactionListCardSchema>;
export type CategoryBreakdownCard = z.infer<typeof categoryBreakdownCardSchema>;
export type ChartCard = z.infer<typeof chartCardSchema>;
export type InsightCard = z.infer<typeof insightCardSchema>;
export type ActionCard = z.infer<typeof actionCardSchema>;
export type EmptyCard = z.infer<typeof emptyCardSchema>;

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
  const segments =
    route.groupId === undefined ? [] : [encodeRouteSegment(groupIdSchema.parse(route.groupId))];

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
