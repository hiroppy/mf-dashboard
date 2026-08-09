import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, type Db, schema } from "../index";
import { getAccountIdsForGroup, resolveGroupId } from "../shared/group-filter";

export interface BankForecastManualEventInput {
  accountId: number;
  date: string;
  amount: number;
  direction: "income" | "expense";
  description: string;
}

export interface BankForecastManualEvent extends BankForecastManualEventInput {
  id: number;
}

const eventSelection = {
  id: schema.bankForecastManualEvents.id,
  accountId: schema.bankForecastManualEvents.accountId,
  date: schema.bankForecastManualEvents.date,
  amount: schema.bankForecastManualEvents.amount,
  direction: schema.bankForecastManualEvents.direction,
  description: schema.bankForecastManualEvents.description,
};

async function getScopedBankAccountIds(
  groupIdParam: string | undefined,
  db: Db,
): Promise<number[]> {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return [];

  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0) return [];

  const rows = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .innerJoin(
      schema.institutionCategories,
      eq(schema.accounts.categoryId, schema.institutionCategories.id),
    )
    .where(
      and(inArray(schema.accounts.id, accountIds), eq(schema.institutionCategories.name, "銀行")),
    )
    .all();
  return rows.map(({ id }) => id);
}

export async function getBankForecastManualEvents(
  groupIdParam?: string,
  db: Db = getDb(),
): Promise<BankForecastManualEvent[]> {
  const accountIds = await getScopedBankAccountIds(groupIdParam, db);
  if (accountIds.length === 0) return [];

  return db
    .select(eventSelection)
    .from(schema.bankForecastManualEvents)
    .where(inArray(schema.bankForecastManualEvents.accountId, accountIds))
    .orderBy(asc(schema.bankForecastManualEvents.date), asc(schema.bankForecastManualEvents.id))
    .all();
}

export async function createBankForecastManualEvent(
  input: BankForecastManualEventInput,
  groupIdParam?: string,
  db: Db = getDb(),
): Promise<BankForecastManualEvent | null> {
  const accountIds = await getScopedBankAccountIds(groupIdParam, db);
  if (!accountIds.includes(input.accountId)) return null;

  const now = new Date().toISOString();
  return db
    .insert(schema.bankForecastManualEvents)
    .values({ ...input, createdAt: now, updatedAt: now })
    .returning(eventSelection)
    .get();
}

export async function updateBankForecastManualEvent(
  id: number,
  input: BankForecastManualEventInput,
  groupIdParam?: string,
  db: Db = getDb(),
): Promise<BankForecastManualEvent | null> {
  const accountIds = await getScopedBankAccountIds(groupIdParam, db);
  if (!accountIds.includes(input.accountId)) return null;

  const updated = await db
    .update(schema.bankForecastManualEvents)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.bankForecastManualEvents.id, id),
        inArray(schema.bankForecastManualEvents.accountId, accountIds),
      ),
    )
    .returning(eventSelection)
    .get();
  return updated ?? null;
}

export async function deleteBankForecastManualEvent(
  id: number,
  groupIdParam?: string,
  db: Db = getDb(),
): Promise<boolean> {
  const accountIds = await getScopedBankAccountIds(groupIdParam, db);
  if (accountIds.length === 0) return false;

  const deleted = await db
    .delete(schema.bankForecastManualEvents)
    .where(
      and(
        eq(schema.bankForecastManualEvents.id, id),
        inArray(schema.bankForecastManualEvents.accountId, accountIds),
      ),
    )
    .returning({ id: schema.bankForecastManualEvents.id })
    .get();
  return deleted !== undefined;
}
