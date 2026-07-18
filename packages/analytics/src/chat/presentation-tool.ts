import { tool } from "ai";
import { z } from "zod";
import { financeChatCardsSchema } from "./cards";

export const financePresentationInputSchema = z.object({ cards: financeChatCardsSchema });

export function createFinancePresentationTool() {
  return tool({
    description:
      "取得済みの家計データを検証済みの画面カードとして提示する。必要なデータ取得後、ユーザーへの回答ごとに1回だけ呼び出す。データがない場合は推測せずemptyカードを使う",
    inputSchema: financePresentationInputSchema,
    execute: async ({ cards }) => cards,
  });
}
