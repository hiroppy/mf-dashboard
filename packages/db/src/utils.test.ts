import { eq } from "drizzle-orm";
import { describe, test, expect, beforeAll, beforeEach, afterAll } from "vitest";
import * as schema from "./schema/schema";
import { createTestDb, resetTestDb, closeTestDb } from "./test-helpers";
import { now, parseAmount, convertToIsoDate, upsertById, upsertOne, getOrCreate } from "./utils";

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

describe("now", () => {
  test("ISO 8601 形式の文字列を返す", async () => {
    const result = now();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe("parseAmount", () => {
  test("円記号・カンマを除去してパースする", async () => {
    expect(parseAmount("¥1,234,567")).toBe(1234567);
  });

  test("スペースを除去する", async () => {
    expect(parseAmount(" 1000 ")).toBe(1000);
  });

  test("+記号を除去する", async () => {
    expect(parseAmount("+500")).toBe(500);
  });

  test("円の文字を除去する", async () => {
    expect(parseAmount("1000円")).toBe(1000);
  });

  test("空文字列は 0 を返す", async () => {
    expect(parseAmount("")).toBe(0);
  });

  test("パース不能な文字列は 0 を返す", async () => {
    expect(parseAmount("abc")).toBe(0);
  });
});

describe("convertToIsoDate", () => {
  test("すでに ISO 形式ならそのまま返す", async () => {
    expect(convertToIsoDate("2025-04-22")).toBe("2025-04-22");
    expect(convertToIsoDate("2025-04-22T10:00:00")).toBe("2025-04-22T10:00:00");
  });

  test("空文字列は空文字列を返す", async () => {
    expect(convertToIsoDate("")).toBe("");
  });

  test("04/22(火) 形式を変換する", async () => {
    expect(convertToIsoDate("04/22(火)", 2025)).toBe("2025-04-22");
  });

  test("04/25 08:51 形式を変換する", async () => {
    expect(convertToIsoDate("04/25 08:51", 2025)).toBe("2025-04-25T08:51:00");
  });

  test("2021-12月末 形式を変換する", async () => {
    expect(convertToIsoDate("2021-12月末")).toBe("2021-12-31");
  });

  test("2022-01月末 形式を変換する", async () => {
    expect(convertToIsoDate("2022-01月末")).toBe("2022-01-31");
  });

  test("2月末はうるう年を考慮する", async () => {
    expect(convertToIsoDate("2024-2月末")).toBe("2024-02-29");
    expect(convertToIsoDate("2023-2月末")).toBe("2023-02-28");
  });

  test("認識できない形式はそのまま返す", async () => {
    expect(convertToIsoDate("unknown")).toBe("unknown");
  });
});

describe("upsertById", () => {
  test("新規レコードを作成して ID を返す", async () => {
    const id = await upsertById(
      db,
      schema.assetCategories,
      eq(schema.assetCategories.name, "テストカテゴリ"),
      { name: "テストカテゴリ" },
      { name: "テストカテゴリ" },
    );
    expect(id).toBeGreaterThan(0);

    const result = await db.select().from(schema.assetCategories).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("テストカテゴリ");
  });

  test("既存レコードを更新して同じ ID を返す", async () => {
    const id1 = await upsertById(
      db,
      schema.assetCategories,
      eq(schema.assetCategories.name, "テストカテゴリ"),
      { name: "テストカテゴリ" },
      { name: "テストカテゴリ" },
    );

    const id2 = await upsertById(
      db,
      schema.assetCategories,
      eq(schema.assetCategories.name, "テストカテゴリ"),
      { name: "テストカテゴリ" },
      { name: "更新カテゴリ" },
    );

    expect(id1).toBe(id2);
    const result = await db.select().from(schema.assetCategories).all();
    expect(result).toHaveLength(1);
  });
});

describe("upsertOne", () => {
  test("新規レコードを作成して isNew: true を返す", async () => {
    const { record, isNew } = await upsertOne<{ id: number; name: string }>(
      db,
      schema.assetCategories,
      eq(schema.assetCategories.name, "テストカテゴリ"),
      { name: "テストカテゴリ" },
      { name: "テストカテゴリ" },
    );
    expect(isNew).toBe(true);
    expect(record.id).toBeGreaterThan(0);
    expect(record.name).toBe("テストカテゴリ");
  });

  test("既存レコードを更新して isNew: false を返す", async () => {
    await upsertOne(
      db,
      schema.assetCategories,
      eq(schema.assetCategories.name, "テストカテゴリ"),
      { name: "テストカテゴリ" },
      { name: "テストカテゴリ" },
    );

    const { record, isNew } = await upsertOne<{ id: number; name: string }>(
      db,
      schema.assetCategories,
      eq(schema.assetCategories.name, "テストカテゴリ"),
      { name: "テストカテゴリ" },
      { name: "テストカテゴリ" },
    );

    expect(isNew).toBe(false);
    expect(record.name).toBe("テストカテゴリ");
  });
});

describe("getOrCreate", () => {
  test("新規レコードを作成して ID を返す", async () => {
    const id = await getOrCreate(
      db,
      schema.assetCategories,
      schema.assetCategories.name,
      "新規カテゴリ",
    );
    expect(id).toBeGreaterThan(0);

    const result = await db.select().from(schema.assetCategories).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("新規カテゴリ");
  });

  test("既存レコードの ID を返す（新規作成しない）", async () => {
    const id1 = await getOrCreate(
      db,
      schema.assetCategories,
      schema.assetCategories.name,
      "既存カテゴリ",
    );
    const id2 = await getOrCreate(
      db,
      schema.assetCategories,
      schema.assetCategories.name,
      "既存カテゴリ",
    );

    expect(id1).toBe(id2);
    const result = await db.select().from(schema.assetCategories).all();
    expect(result).toHaveLength(1);
  });
});
