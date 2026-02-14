import { desc, eq, sql } from "drizzle-orm";
import { getDb, type Db, schema } from "../index";

export async function getCurrentGroup(db: Db = getDb()) {
  return await db.select().from(schema.groups).where(eq(schema.groups.isCurrent, true)).get();
}

export async function getAllGroups(db: Db = getDb()) {
  return await db
    .select()
    .from(schema.groups)
    .orderBy(
      desc(sql`CASE WHEN ${schema.groups.isCurrent} = 1 THEN 1 ELSE 0 END`),
      desc(schema.groups.lastScrapedAt),
    )
    .all();
}
