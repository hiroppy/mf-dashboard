import { eq } from "drizzle-orm";
import type { Db } from "../index";
import type { Group } from "../types";
import { schema } from "../index";
import { now, upsertById } from "../utils";

export async function getCurrentGroupId(db: Db): Promise<string | null> {
  const group = await db
    .select({ id: schema.groups.id })
    .from(schema.groups)
    .where(eq(schema.groups.isCurrent, true))
    .get();
  return group?.id ?? null;
}

export async function clearGroupAccountLinks(db: Db, groupId: string): Promise<void> {
  await db.delete(schema.groupAccounts).where(eq(schema.groupAccounts.groupId, groupId)).run();
}

export async function linkAccountToGroup(
  db: Db,
  groupId: string,
  accountId: number,
): Promise<void> {
  await db
    .insert(schema.groupAccounts)
    .values({
      groupId,
      accountId,
      createdAt: now(),
      updatedAt: now(),
    })
    .onConflictDoNothing()
    .run();
}

export async function upsertGroup(db: Db, group: Group): Promise<void> {
  // isCurrent=trueの場合のみ、他のグループをfalseにする
  if (group.isCurrent) {
    await db.update(schema.groups).set({ isCurrent: false, updatedAt: now() }).run();
  }

  // グループをupsert
  await upsertById(
    db,
    schema.groups,
    eq(schema.groups.id, group.id),
    {
      id: group.id,
      name: group.name,
      isCurrent: group.isCurrent,
    },
    {
      name: group.name,
      isCurrent: group.isCurrent,
    },
  );
}

export async function updateGroupLastScrapedAt(
  db: Db,
  groupId: string,
  timestamp: string,
): Promise<void> {
  await db
    .update(schema.groups)
    .set({ lastScrapedAt: timestamp, updatedAt: now() })
    .where(eq(schema.groups.id, groupId))
    .run();
}

/**
 * 複数アカウントリンクの一括insert
 */
export async function linkAccountsToGroup(
  db: Db,
  groupId: string,
  accountIds: number[],
): Promise<void> {
  if (accountIds.length === 0) return;

  const timestamp = now();
  const records = accountIds.map((accountId) => ({
    groupId,
    accountId,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  await db.insert(schema.groupAccounts).values(records).onConflictDoNothing().run();
}
