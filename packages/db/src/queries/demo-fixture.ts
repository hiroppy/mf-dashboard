import { count, inArray, notLike } from "drizzle-orm";
import { getDb, type Db, schema } from "../index";

export async function getDemoFixtureFingerprint(db: Db = getDb()) {
  const [
    groups,
    accountCount,
    nonDemoAccountCount,
    transactionCount,
    nonDemoTransactionCount,
    assetHistoryCount,
    sentinels,
  ] = await Promise.all([
    db
      .select({
        id: schema.groups.id,
        isCurrent: schema.groups.isCurrent,
        name: schema.groups.name,
      })
      .from(schema.groups)
      .orderBy(schema.groups.id)
      .all(),
    db.select({ value: count() }).from(schema.accounts).get(),
    db
      .select({ value: count() })
      .from(schema.accounts)
      .where(notLike(schema.accounts.mfId, "demo_%"))
      .get(),
    db.select({ value: count() }).from(schema.transactions).get(),
    db
      .select({ value: count() })
      .from(schema.transactions)
      .where(notLike(schema.transactions.mfId, "demo_%"))
      .get(),
    db.select({ value: count() }).from(schema.assetHistory).get(),
    db
      .select({
        amount: schema.transactions.amount,
        category: schema.transactions.category,
        date: schema.transactions.date,
        description: schema.transactions.description,
        mfId: schema.transactions.mfId,
        type: schema.transactions.type,
      })
      .from(schema.transactions)
      .where(inArray(schema.transactions.mfId, ["demo_001279", "demo_001281"]))
      .orderBy(schema.transactions.mfId)
      .all(),
  ]);

  return {
    accountCount: accountCount?.value ?? 0,
    assetHistoryCount: assetHistoryCount?.value ?? 0,
    groups,
    nonDemoAccountCount: nonDemoAccountCount?.value ?? 0,
    nonDemoTransactionCount: nonDemoTransactionCount?.value ?? 0,
    sentinels,
    transactionCount: transactionCount?.value ?? 0,
  };
}
