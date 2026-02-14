import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { schema } from "../index";
import { createTestDb, resetTestDb, closeTestDb } from "../test-helpers";
import { getCurrentGroup, getAllGroups } from "./groups";

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

describe("getCurrentGroup", () => {
  it("isCurrent=trueのグループを返す", async () => {
    const now = new Date().toISOString();
    await db
      .insert(schema.groups)
      .values({
        id: "group_001",
        name: "Current Group",
        isCurrent: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const result = await getCurrentGroup(db);

    expect(result?.id).toBe("group_001");
    expect(result?.name).toBe("Current Group");
  });

  it("該当がない場合はundefinedを返す", async () => {
    expect(await getCurrentGroup(db)).toBeUndefined();
  });
});

describe("getAllGroups", () => {
  it("isCurrent=trueを最初に、lastScrapedAt降順でソート", async () => {
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    await db
      .insert(schema.groups)
      .values([
        {
          id: "g1",
          name: "Group 1",
          isCurrent: false,
          lastScrapedAt: yesterday,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "g2",
          name: "Group 2",
          isCurrent: true,
          lastScrapedAt: yesterday,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "g3",
          name: "Group 3",
          isCurrent: false,
          lastScrapedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    const result = await getAllGroups(db);

    expect(result[0].id).toBe("g2"); // isCurrent=true が最初
    expect(result[1].id).toBe("g3"); // 次に lastScrapedAt が新しい順
    expect(result[2].id).toBe("g1");
  });
});
