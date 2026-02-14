import { describe, test, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createTestDb, resetTestDb, closeTestDb } from "../test-helpers";
import { getOrCreateCategory } from "./categories";

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

describe("getOrCreateCategory", () => {
  test("新規カテゴリを作成して ID を返す", async () => {
    const id = await getOrCreateCategory(db, "預金・現金・暗号資産");
    expect(id).toBeGreaterThan(0);
  });

  test("既存カテゴリの ID を返す", async () => {
    const id1 = await getOrCreateCategory(db, "預金・現金・暗号資産");
    const id2 = await getOrCreateCategory(db, "預金・現金・暗号資産");
    expect(id1).toBe(id2);
  });

  test("異なるカテゴリには異なる ID を返す", async () => {
    const id1 = await getOrCreateCategory(db, "預金・現金・暗号資産");
    const id2 = await getOrCreateCategory(db, "株式（現物）");
    expect(id1).not.toBe(id2);
  });

  test("任意の名前でカテゴリを作成できる", async () => {
    const id = await getOrCreateCategory(db, "新しいカテゴリ");
    expect(id).toBeGreaterThan(0);
  });
});
