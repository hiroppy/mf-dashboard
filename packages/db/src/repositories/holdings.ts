import { eq, and } from "drizzle-orm";
import type { Db } from "../index";
import type { HoldingType } from "../types";
import { schema } from "../index";
import { now, upsertById } from "../utils";

// 毎回新規作成（同じ銘柄でも別レコードとして保存）
export async function createHolding(
  db: Db,
  accountId: number,
  name: string,
  type: HoldingType,
  options: {
    categoryId?: number | null;
    liabilityCategory?: string | null;
    code?: string | null;
  } = {},
): Promise<number> {
  const result = await db
    .insert(schema.holdings)
    .values({
      mfId: null,
      accountId,
      categoryId: options.categoryId ?? null,
      name,
      code: options.code ?? null,
      type,
      liabilityCategory: options.liabilityCategory ?? null,
      createdAt: now(),
      updatedAt: now(),
      isActive: true,
    })
    .returning({ id: schema.holdings.id })
    .get();

  return result.id;
}

export async function saveHoldingValue(
  db: Db,
  holdingId: number,
  snapshotId: number,
  values: {
    amount: number;
    quantity?: number | null;
    unitPrice?: number | null;
    avgCostPrice?: number | null;
    dailyChange?: number | null;
    unrealizedGain?: number | null;
    unrealizedGainPct?: number | null;
  },
): Promise<void> {
  const data = {
    holdingId,
    snapshotId,
    amount: values.amount,
    quantity: values.quantity ?? null,
    unitPrice: values.unitPrice ?? null,
    avgCostPrice: values.avgCostPrice ?? null,
    dailyChange: values.dailyChange ?? null,
    unrealizedGain: values.unrealizedGain ?? null,
    unrealizedGainPct: values.unrealizedGainPct ?? null,
  };

  await upsertById(
    db,
    schema.holdingValues,
    and(
      eq(schema.holdingValues.holdingId, holdingId),
      eq(schema.holdingValues.snapshotId, snapshotId),
    )!,
    data,
    data,
  );
}
