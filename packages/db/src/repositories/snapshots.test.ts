import { describe, test, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createTestDb, resetTestDb, closeTestDb } from "../test-helpers";
import { upsertGroup } from "./groups";
import { createSnapshot } from "./snapshots";

type Db = ReturnType<typeof createTestDb>;

let db: Db;

beforeAll(() => {
  db = createTestDb();
});

afterAll(() => {
  closeTestDb(db);
});

beforeEach(async () => {
  await resetTestDb(db);
});

describe("createSnapshot", () => {
  test("スナップショットを作成して ID を返す", async () => {
    await upsertGroup(db, { id: "g1", name: "test", isCurrent: true });
    const id = await createSnapshot(db, "g1", "2025-04-26");
    expect(id).toBeGreaterThan(0);
  });

  test("同じ日に複数スナップショットを作成できる", async () => {
    await upsertGroup(db, { id: "g1", name: "test", isCurrent: true });
    const id1 = await createSnapshot(db, "g1", "2025-04-26");
    const id2 = await createSnapshot(db, "g1", "2025-04-26");
    expect(id1).not.toBe(id2);
  });
});
