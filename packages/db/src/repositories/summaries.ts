import { eq, and, notInArray, sql } from "drizzle-orm";
import type { Db } from "../index";
import type { AssetHistoryPoint } from "../types";
import { schema } from "../index";
import { now, convertToIsoDate, upsertById } from "../utils";

// ============================================================================
// Internal Helpers
// ============================================================================

async function saveAssetHistoryPoint(
  db: Db,
  groupId: string,
  point: AssetHistoryPoint,
): Promise<number> {
  const isoDate = convertToIsoDate(point.date);

  const data = {
    groupId,
    date: isoDate,
    totalAssets: point.totalAssets,
    change: point.change,
  };

  return await upsertById(
    db,
    schema.assetHistory,
    and(eq(schema.assetHistory.groupId, groupId), eq(schema.assetHistory.date, isoDate))!,
    data,
    data,
  );
}

async function saveAssetHistoryCategories(
  db: Db,
  historyId: number,
  categories: Record<string, number>,
): Promise<void> {
  const categoryNames = Object.keys(categories);

  // スクレイピング結果にないカテゴリを削除
  if (categoryNames.length > 0) {
    await db
      .delete(schema.assetHistoryCategories)
      .where(
        and(
          eq(schema.assetHistoryCategories.assetHistoryId, historyId),
          notInArray(schema.assetHistoryCategories.categoryName, categoryNames),
        ),
      )
      .run();
  } else {
    // カテゴリが空の場合は全削除
    await db
      .delete(schema.assetHistoryCategories)
      .where(eq(schema.assetHistoryCategories.assetHistoryId, historyId))
      .run();
    return;
  }

  // バルクupsert
  const timestamp = now();
  const records = Object.entries(categories).map(([categoryName, amount]) => ({
    assetHistoryId: historyId,
    categoryName,
    amount,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  // SQLiteではcomposite keyでのonConflictDoUpdateには
  // unique indexが必要（既にasset_history_categories_history_category_idxがある）
  await db
    .insert(schema.assetHistoryCategories)
    .values(records)
    .onConflictDoUpdate({
      target: [
        schema.assetHistoryCategories.assetHistoryId,
        schema.assetHistoryCategories.categoryName,
      ],
      set: {
        amount: sql`excluded.amount`,
        updatedAt: timestamp,
      },
    })
    .run();
}

// ============================================================================
// Public Functions
// ============================================================================

export async function saveAssetHistory(
  db: Db,
  groupId: string,
  points: AssetHistoryPoint[],
): Promise<void> {
  for (const point of points) {
    const historyId = await saveAssetHistoryPoint(db, groupId, point);
    await saveAssetHistoryCategories(db, historyId, point.categories);
  }
}
