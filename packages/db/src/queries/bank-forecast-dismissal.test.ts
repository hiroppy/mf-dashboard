import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../schema/schema";
import {
  closeTestDb,
  createTestDb,
  createTestGroup,
  resetTestDb,
  TEST_GROUP_ID,
} from "../test-helpers";
import { dismissBankForecastCandidate, getBankForecastDismissals } from "./bank-forecast-dismissal";

type Db = Awaited<ReturnType<typeof createTestDb>>;

let db: Db;
let accountId: number;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(() => closeTestDb(db));

beforeEach(async () => {
  await resetTestDb(db);
  await createTestGroup(db);
  const now = new Date().toISOString();
  const account = await db
    .insert(schema.accounts)
    .values({
      mfId: "account-a",
      name: "Account A",
      type: "automatic",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.accounts.id })
    .get();
  accountId = account.id;
  await db.insert(schema.groupAccounts).values({
    groupId: TEST_GROUP_ID,
    accountId,
    createdAt: now,
    updatedAt: now,
  });
});

describe("bank forecast dismissals", () => {
  it("stores a dismissal and advances its watermark", async () => {
    const input = {
      accountId,
      direction: "expense" as const,
      recurringIdentity: "investment transfer",
      dismissedThroughDate: "2026-07-20",
    };

    await expect(dismissBankForecastCandidate(input, TEST_GROUP_ID, db)).resolves.toBe(true);
    await dismissBankForecastCandidate(
      { ...input, dismissedThroughDate: "2026-08-20" },
      TEST_GROUP_ID,
      db,
    );

    await expect(getBankForecastDismissals(TEST_GROUP_ID, db)).resolves.toMatchObject([
      { ...input, dismissedThroughDate: "2026-08-20" },
    ]);
  });

  it("rejects an account outside the selected group", async () => {
    await expect(
      dismissBankForecastCandidate(
        {
          accountId: accountId + 1,
          direction: "income",
          recurringIdentity: "deposit",
          dismissedThroughDate: "2026-07-20",
        },
        TEST_GROUP_ID,
        db,
      ),
    ).resolves.toBe(false);
  });
});
