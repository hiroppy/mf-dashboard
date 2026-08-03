import { inArray } from "drizzle-orm";
import { getDb, type Db, schema } from "../index";
import { getAccountIdsForGroup, resolveGroupId } from "../shared/group-filter";

export interface BankForecastDismissalInput {
  accountId: number;
  direction: "income" | "expense";
  recurringIdentity: string;
  dismissedThroughDate: string;
}

export async function getBankForecastDismissals(groupIdParam?: string, db: Db = getDb()) {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return [];

  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0) return [];

  return db
    .select({
      accountId: schema.bankForecastDismissals.accountId,
      direction: schema.bankForecastDismissals.direction,
      recurringIdentity: schema.bankForecastDismissals.recurringIdentity,
      dismissedThroughDate: schema.bankForecastDismissals.dismissedThroughDate,
    })
    .from(schema.bankForecastDismissals)
    .where(inArray(schema.bankForecastDismissals.accountId, accountIds))
    .all();
}

export async function dismissBankForecastCandidate(
  input: BankForecastDismissalInput,
  groupIdParam?: string,
  db: Db = getDb(),
): Promise<boolean> {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return false;

  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (!accountIds.includes(input.accountId)) return false;

  const now = new Date().toISOString();
  await db
    .insert(schema.bankForecastDismissals)
    .values({ ...input, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [
        schema.bankForecastDismissals.accountId,
        schema.bankForecastDismissals.direction,
        schema.bankForecastDismissals.recurringIdentity,
      ],
      set: { dismissedThroughDate: input.dismissedThroughDate, updatedAt: now },
    });
  return true;
}
