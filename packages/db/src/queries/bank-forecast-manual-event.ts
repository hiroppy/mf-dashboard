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

async function resolveBankForecastScope(
  groupIdParam: string | undefined,
  db: Db,
): Promise<{ groupId: string; accountIds: number[] } | null> {
  const groupId = await resolveGroupId(db, groupIdParam);
  if (!groupId) return null;

  const accountIds = await getAccountIdsForGroup(db, groupId);
  if (accountIds.length === 0) return { groupId, accountIds: [] };

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
  return { groupId, accountIds: rows.map(({ id }) => id) };
}

export async function getBankForecastManualEvents(
  groupIdParam?: string,
  db: Db = getDb(),
): Promise<BankForecastManualEvent[]> {
  const scope = await resolveBankForecastScope(groupIdParam, db);
  if (!scope || scope.accountIds.length === 0) return [];

  return db
    .select(eventSelection)
    .from(schema.bankForecastManualEvents)
    .where(
      and(
        eq(schema.bankForecastManualEvents.groupId, scope.groupId),
        inArray(schema.bankForecastManualEvents.accountId, scope.accountIds),
      ),
    )
    .orderBy(asc(schema.bankForecastManualEvents.date), asc(schema.bankForecastManualEvents.id))
    .all();
}

export async function createBankForecastManualEvent(
  input: BankForecastManualEventInput,
  groupIdParam?: string,
  db: Db = getDb(),
): Promise<BankForecastManualEvent | null> {
  const scope = await resolveBankForecastScope(groupIdParam, db);
  if (!scope?.accountIds.includes(input.accountId)) return null;

  const now = new Date().toISOString();
  return db
    .insert(schema.bankForecastManualEvents)
    .values({ ...input, groupId: scope.groupId, createdAt: now, updatedAt: now })
    .returning(eventSelection)
    .get();
}

export async function updateBankForecastManualEvent(
  id: number,
  input: BankForecastManualEventInput,
  groupIdParam?: string,
  db: Db = getDb(),
): Promise<BankForecastManualEvent | null> {
  const scope = await resolveBankForecastScope(groupIdParam, db);
  if (!scope?.accountIds.includes(input.accountId)) return null;

  const updated = await db
    .update(schema.bankForecastManualEvents)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.bankForecastManualEvents.id, id),
        eq(schema.bankForecastManualEvents.groupId, scope.groupId),
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
  const scope = await resolveBankForecastScope(groupIdParam, db);
  if (!scope) return false;

  const deleted = await db
    .delete(schema.bankForecastManualEvents)
    .where(
      and(
        eq(schema.bankForecastManualEvents.id, id),
        eq(schema.bankForecastManualEvents.groupId, scope.groupId),
      ),
    )
    .returning({ id: schema.bankForecastManualEvents.id })
    .get();
  return deleted !== undefined;
}
