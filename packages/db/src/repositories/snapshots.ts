import type { Db } from "../index";
import type { RefreshResult } from "../types";
import { schema } from "../index";
import { now } from "../utils";

// 実行ごとに新しいスナップショットを作成（同じ日でも複数作成可能）
export async function createSnapshot(
  db: Db,
  groupId: string,
  date: string,
  refreshResult?: RefreshResult | null,
): Promise<number> {
  const result = await db
    .insert(schema.dailySnapshots)
    .values({
      groupId,
      date,
      refreshCompleted: refreshResult?.completed ?? true,
      createdAt: now(),
      updatedAt: now(),
    })
    .returning({ id: schema.dailySnapshots.id })
    .get();

  const snapshotId = result.id;

  return snapshotId;
}
