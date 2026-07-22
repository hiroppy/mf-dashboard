import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema/schema";
import { closeTestDb, createTestDb } from "../test-helpers";
import { getDemoFixtureFingerprint, matchesDemoFixtureFingerprint } from "./demo-fixture";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

describe("demo fixture fingerprint", () => {
  let db: TestDb;
  let holdingId: number;

  beforeAll(async () => {
    db = await createTestDb();
    const now = "2026-07-01T00:00:00.000Z";
    await db.insert(schema.accounts).values({
      createdAt: now,
      mfId: "demo_account_001",
      name: "Demo Bank",
      type: "自動連携",
      updatedAt: now,
    });
    const account = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(eq(schema.accounts.mfId, "demo_account_001"))
      .get();
    const [holding] = await db
      .insert(schema.holdings)
      .values({
        accountId: account!.id,
        createdAt: now,
        name: "Demo Holding",
        type: "asset",
        updatedAt: now,
      })
      .returning({ id: schema.holdings.id });
    holdingId = holding!.id;
  });

  afterAll(() => closeTestDb(db));

  it("rejects a matching fixture fingerprint after a holding changes", async () => {
    const expectedFingerprint = await getDemoFixtureFingerprint(db);
    await expect(matchesDemoFixtureFingerprint(expectedFingerprint, db)).resolves.toBe(true);

    await db
      .update(schema.holdings)
      .set({ name: "Changed Demo Holding" })
      .where(eq(schema.holdings.id, holdingId));

    await expect(matchesDemoFixtureFingerprint(expectedFingerprint, db)).resolves.toBe(false);
  });
});
