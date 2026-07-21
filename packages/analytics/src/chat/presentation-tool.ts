import { tool } from "ai";
import { z } from "zod";
import { buildFinanceChatHref, financeChatCardsSchema, type FinanceChatCard } from "./cards";

function getCardHrefs(cards: FinanceChatCard[]): string[] {
  return cards.flatMap((card) => {
    if ("href" in card && card.href !== undefined) return [card.href];
    if ("action" in card && card.action !== undefined) return [card.action.href];
    return [];
  });
}

export function createFinancePresentationInputSchema(
  groupId: string,
  allowedHrefs?: ReadonlySet<string>,
) {
  const groupHref = buildFinanceChatHref({ page: "dashboard", groupId });

  return z.object({ cards: financeChatCardsSchema }).superRefine(({ cards }, context) => {
    for (const href of getCardHrefs(cards)) {
      if (href !== groupHref && !href.startsWith(`${groupHref}/`)) {
        context.addIssue({
          code: "custom",
          message: "CTA routes must belong to the current group",
          path: ["cards"],
        });
      } else if (allowedHrefs !== undefined && !allowedHrefs.has(href)) {
        context.addIssue({
          code: "custom",
          message: "CTA routes must come from the navigation tool",
          path: ["cards"],
        });
      }
    }
  });
}

export function createFinancePresentationTool(groupId: string, allowedHrefs?: ReadonlySet<string>) {
  return tool({
    description:
      "取得済みの家計データを検証済みの画面カードとして提示する。必要なデータ取得後、ユーザーへの回答ごとに1回だけ呼び出す。データがない場合は推測せずemptyカードを使う",
    inputSchema: createFinancePresentationInputSchema(groupId, allowedHrefs),
    execute: async ({ cards }) => cards,
  });
}
