import {
  searchTransactions,
  SEARCH_TRANSACTIONS_MAX_LIMIT,
  SEARCH_TRANSACTIONS_MAX_OFFSET,
  type Db,
} from "@mf-dashboard/db";
import { tool } from "ai";
import { z } from "zod";

const dateSchema = z.iso.date();
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const transactionSearchInputSchema = z
  .object({
    date: dateSchema.optional().describe("対象日 (YYYY-MM-DD形式)"),
    startDate: dateSchema.optional().describe("期間の開始日、境界を含む (YYYY-MM-DD形式)"),
    endDate: dateSchema.optional().describe("期間の終了日、境界を含む (YYYY-MM-DD形式)"),
    month: monthSchema.optional().describe("対象月 (YYYY-MM形式)"),
    category: z.string().optional().describe("大カテゴリの完全一致"),
    subCategory: z.string().optional().describe("中カテゴリの完全一致"),
    keyword: z
      .string()
      .optional()
      .describe("内容・大カテゴリ・中カテゴリを対象にした部分一致キーワード"),
    minAmount: z.number().nonnegative().optional().describe("最小金額、境界を含む"),
    maxAmount: z.number().nonnegative().optional().describe("最大金額、境界を含む"),
    type: z.enum(["income", "expense", "transfer"]).optional().describe("取引種別"),
    includeTransfers: z.boolean().optional().describe("振替を含めるか。省略時は含める"),
    includeExcluded: z.boolean().optional().describe("計算対象外の明細を含めるか。省略時は含める"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(SEARCH_TRANSACTIONS_MAX_LIMIT)
      .optional()
      .describe("取得件数。省略時は50件、最大100件"),
    offset: z
      .number()
      .int()
      .nonnegative()
      .max(SEARCH_TRANSACTIONS_MAX_OFFSET)
      .optional()
      .describe("取得開始位置。省略時は0、最大10000"),
  })
  .refine(({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate, {
    message: "開始日は終了日以前を指定してください",
    path: ["endDate"],
  })
  .refine(
    ({ minAmount, maxAmount }) =>
      minAmount === undefined || maxAmount === undefined || minAmount <= maxAmount,
    {
      message: "最小金額は最大金額以下を指定してください",
      path: ["maxAmount"],
    },
  );

export function createTransactionSearchTool(db: Db, groupId: string) {
  return tool({
    description:
      "家計の取引明細を日付・期間・月・カテゴリ・キーワード・金額・種別・振替/計算対象外の状態で検索する",
    inputSchema: transactionSearchInputSchema,
    execute: async (options) => await searchTransactions({ ...options, groupId }, db),
  });
}
