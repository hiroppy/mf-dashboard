import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../schema/schema";
import {
  closeTestDb,
  createTestDb,
  createTestGroup,
  resetTestDb,
  TEST_GROUP_ID,
} from "../test-helpers";
import {
  createBankForecastManualEvent,
  deleteBankForecastManualEvent,
  getBankForecastManualEvents,
  updateBankForecastManualEvent,
} from "./bank-forecast-manual-event";

type Db = Awaited<ReturnType<typeof createTestDb>>;

let db: Db;
let accountId: number;
let externalAccountId: number;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(() => closeTestDb(db));

beforeEach(async () => {
  await resetTestDb(db);
  await createTestGroup(db);
  const now = new Date().toISOString();
  const bankCategory = await db
    .insert(schema.institutionCategories)
    .values({ name: "銀行", createdAt: now, updatedAt: now })
    .returning({ id: schema.institutionCategories.id })
    .get();
  const accounts = await db
    .insert(schema.accounts)
    .values([
      {
        mfId: "account-a",
        name: "Account A",
        type: "automatic",
        categoryId: bankCategory.id,
        createdAt: now,
        updatedAt: now,
      },
      {
        mfId: "account-b",
        name: "Account B",
        type: "automatic",
        categoryId: bankCategory.id,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .returning({ id: schema.accounts.id })
    .all();
  accountId = accounts[0]!.id;
  externalAccountId = accounts[1]!.id;
  await db.insert(schema.groupAccounts).values({
    groupId: TEST_GROUP_ID,
    accountId,
    createdAt: now,
    updatedAt: now,
  });
});

const input = () => ({
  accountId,
  date: "2026-10-15",
  amount: 120_000,
  direction: "expense" as const,
  description: "予定納税",
});

describe("bank forecast manual events", () => {
  it("creates, lists, updates, and deletes an event in the selected group", async () => {
    const created = await createBankForecastManualEvent(input(), TEST_GROUP_ID, db);
    expect(created).toMatchObject(input());

    const updated = await updateBankForecastManualEvent(
      created!.id,
      { ...input(), amount: 100_000, description: "税金支払い" },
      TEST_GROUP_ID,
      db,
    );
    expect(updated).toMatchObject({ amount: 100_000, description: "税金支払い" });
    await expect(getBankForecastManualEvents(TEST_GROUP_ID, db)).resolves.toEqual([updated]);

    await expect(deleteBankForecastManualEvent(created!.id, TEST_GROUP_ID, db)).resolves.toBe(true);
    await expect(getBankForecastManualEvents(TEST_GROUP_ID, db)).resolves.toEqual([]);
  });

  it("rejects create, update, and delete across the selected group boundary", async () => {
    await expect(
      createBankForecastManualEvent(
        { ...input(), accountId: externalAccountId },
        TEST_GROUP_ID,
        db,
      ),
    ).resolves.toBeNull();

    const now = new Date().toISOString();
    const external = await db
      .insert(schema.bankForecastManualEvents)
      .values({
        ...input(),
        accountId: externalAccountId,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.bankForecastManualEvents.id })
      .get();
    await expect(getBankForecastManualEvents(TEST_GROUP_ID, db)).resolves.toEqual([]);
    await expect(
      updateBankForecastManualEvent(external.id, input(), TEST_GROUP_ID, db),
    ).resolves.toBeNull();
    await expect(deleteBankForecastManualEvent(external.id, TEST_GROUP_ID, db)).resolves.toBe(
      false,
    );
  });

  it("rejects an in-group account outside the bank category", async () => {
    const now = new Date().toISOString();
    const category = await db
      .insert(schema.institutionCategories)
      .values({ name: "証券", createdAt: now, updatedAt: now })
      .returning({ id: schema.institutionCategories.id })
      .get();
    const account = await db
      .insert(schema.accounts)
      .values({
        mfId: "account-securities",
        name: "Account C",
        type: "automatic",
        categoryId: category.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.accounts.id })
      .get();
    await db.insert(schema.groupAccounts).values({
      groupId: TEST_GROUP_ID,
      accountId: account.id,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      createBankForecastManualEvent({ ...input(), accountId: account.id }, TEST_GROUP_ID, db),
    ).resolves.toBeNull();
  });
});
