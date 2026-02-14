import { eq } from "drizzle-orm";
import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import type { Group } from "../types";
import * as schema from "../schema/schema";
import { createTestDb, resetTestDb, closeTestDb } from "../test-helpers";
import { upsertAccount } from "./accounts";
import {
  upsertGroup,
  updateGroupLastScrapedAt,
  getCurrentGroupId,
  linkAccountToGroup,
  clearGroupAccountLinks,
} from "./groups";

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

describe("upsertGroup", () => {
  const group: Group = { id: "g1", name: "テストグループ", isCurrent: true };

  test("新規グループを作成できる", async () => {
    await upsertGroup(db, group);
    const result = await db.select().from(schema.groups).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("テストグループ");
    expect(result[0].isCurrent).toBe(true);
  });

  test("既存グループを更新できる", async () => {
    await upsertGroup(db, group);
    await upsertGroup(db, { ...group, name: "更新後" });
    const result = await db.select().from(schema.groups).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("更新後");
  });

  test("新しいグループをupsertすると古いグループのisCurrentがfalseになる", async () => {
    await upsertGroup(db, group);
    await upsertGroup(db, { id: "g2", name: "別のグループ", isCurrent: true });
    const g1 = await db.select().from(schema.groups).where(eq(schema.groups.id, "g1")).get();
    expect(g1?.isCurrent).toBe(false);
  });

  test("isCurrent=falseのグループをupsertしても他のグループのisCurrentは変わらない", async () => {
    await upsertGroup(db, { id: "g1", name: "グループ1", isCurrent: true });
    await upsertGroup(db, { id: "g2", name: "グループ2", isCurrent: false });

    const g1 = await db.select().from(schema.groups).where(eq(schema.groups.id, "g1")).get();
    const g2 = await db.select().from(schema.groups).where(eq(schema.groups.id, "g2")).get();

    expect(g1?.isCurrent).toBe(true);
    expect(g2?.isCurrent).toBe(false);
  });

  test("複数のisCurrent=falseグループをupsertしても最初のisCurrent=trueグループは維持される", async () => {
    await upsertGroup(db, { id: "g1", name: "デフォルト", isCurrent: true });
    await upsertGroup(db, { id: "g2", name: "グループ2", isCurrent: false });
    await upsertGroup(db, { id: "g3", name: "グループ3", isCurrent: false });
    await upsertGroup(db, { id: "g4", name: "グループ4", isCurrent: false });

    const groups = await db.select().from(schema.groups).all();
    const currentGroups = groups.filter((g) => g.isCurrent);

    expect(currentGroups).toHaveLength(1);
    expect(currentGroups[0].id).toBe("g1");
  });
});

describe("updateGroupLastScrapedAt", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-04-29T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("lastScrapedAt を更新できる", async () => {
    await upsertGroup(db, { id: "g1", name: "テストグループ", isCurrent: true });
    const timestamp = "2025-04-29T14:00:00.000Z";

    await updateGroupLastScrapedAt(db, "g1", timestamp);

    const result = await db.select().from(schema.groups).where(eq(schema.groups.id, "g1")).get();
    expect(result?.lastScrapedAt).toBe(timestamp);
  });

  test("updatedAt も更新される", async () => {
    await upsertGroup(db, { id: "g1", name: "テストグループ", isCurrent: true });
    const before = await db.select().from(schema.groups).where(eq(schema.groups.id, "g1")).get();

    // 時間を1秒進める
    vi.advanceTimersByTime(1000);

    await updateGroupLastScrapedAt(db, "g1", "2025-04-29T14:00:00.000Z");

    const after = await db.select().from(schema.groups).where(eq(schema.groups.id, "g1")).get();
    expect(after?.updatedAt).not.toBe(before?.updatedAt);
    expect(after?.updatedAt).toBe("2025-04-29T12:00:01.000Z");
  });
});

describe("getCurrentGroupId", () => {
  test("現在のグループIDを取得できる", async () => {
    await upsertGroup(db, { id: "g1", name: "テストグループ", isCurrent: true });

    const result = await getCurrentGroupId(db);

    expect(result).toBe("g1");
  });

  test("現在のグループがない場合はnullを返す", async () => {
    // グループを作成してからisCurrent=falseに更新
    await upsertGroup(db, { id: "g1", name: "テストグループ", isCurrent: true });
    await db.update(schema.groups).set({ isCurrent: false }).run();

    const result = await getCurrentGroupId(db);

    expect(result).toBeNull();
  });

  test("グループが存在しない場合はnullを返す", async () => {
    const result = await getCurrentGroupId(db);

    expect(result).toBeNull();
  });

  test("複数のグループがある場合、isCurrentがtrueのグループIDを返す", async () => {
    await upsertGroup(db, { id: "g1", name: "グループ1", isCurrent: true });
    await upsertGroup(db, { id: "g2", name: "グループ2", isCurrent: true });

    const result = await getCurrentGroupId(db);

    expect(result).toBe("g2");
  });
});

// Helper to create test account
async function createTestAccount(mfId: string, name: string): Promise<number> {
  return await upsertAccount(db, {
    mfId,
    name,
    type: "bank",
    status: "ok",
    lastUpdated: "2025-04-01",
    url: `/accounts/show/${mfId}`,
    totalAssets: 100000,
  });
}

describe("clearGroupAccountLinks", () => {
  test("指定グループのリンクをすべて削除できる", async () => {
    await upsertGroup(db, { id: "g1", name: "テストグループ", isCurrent: true });
    const account1 = await createTestAccount("mf1", "銀行1");
    const account2 = await createTestAccount("mf2", "銀行2");

    await linkAccountToGroup(db, "g1", account1);
    await linkAccountToGroup(db, "g1", account2);

    expect(await db.select().from(schema.groupAccounts).all()).toHaveLength(2);

    await clearGroupAccountLinks(db, "g1");

    expect(await db.select().from(schema.groupAccounts).all()).toHaveLength(0);
  });

  test("他のグループのリンクには影響しない", async () => {
    await upsertGroup(db, { id: "g1", name: "グループ1", isCurrent: true });
    await upsertGroup(db, { id: "g2", name: "グループ2", isCurrent: false });
    const account1 = await createTestAccount("mf1", "銀行1");
    const account2 = await createTestAccount("mf2", "銀行2");

    await linkAccountToGroup(db, "g1", account1);
    await linkAccountToGroup(db, "g2", account2);

    await clearGroupAccountLinks(db, "g1");

    const remaining = await db.select().from(schema.groupAccounts).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].groupId).toBe("g2");
  });

  test("存在しないグループIDでもエラーにならない", async () => {
    await expect(clearGroupAccountLinks(db, "nonexistent")).resolves.not.toThrow();
  });

  test("リンクがない状態でもエラーにならない", async () => {
    await upsertGroup(db, { id: "g1", name: "テストグループ", isCurrent: true });
    await expect(clearGroupAccountLinks(db, "g1")).resolves.not.toThrow();
  });
});

describe("linkAccountToGroup", () => {
  test("アカウントをグループに紐付けできる", async () => {
    await upsertGroup(db, { id: "g1", name: "テストグループ", isCurrent: true });
    const accountId = await createTestAccount("mf1", "テスト銀行");

    await linkAccountToGroup(db, "g1", accountId);

    const result = await db.select().from(schema.groupAccounts).all();
    expect(result).toHaveLength(1);
    expect(result[0].groupId).toBe("g1");
    expect(result[0].accountId).toBe(accountId);
  });

  test("同じアカウントを同じグループに複数回紐付けしても重複しない", async () => {
    await upsertGroup(db, { id: "g1", name: "テストグループ", isCurrent: true });
    const accountId = await createTestAccount("mf1", "テスト銀行");

    await linkAccountToGroup(db, "g1", accountId);
    await linkAccountToGroup(db, "g1", accountId);
    await linkAccountToGroup(db, "g1", accountId);

    const result = await db.select().from(schema.groupAccounts).all();
    expect(result).toHaveLength(1);
  });

  test("同じアカウントを異なるグループに紐付けできる", async () => {
    await upsertGroup(db, { id: "g1", name: "グループ1", isCurrent: true });
    await upsertGroup(db, { id: "g2", name: "グループ2", isCurrent: true });
    const accountId = await createTestAccount("mf1", "共有銀行");

    await linkAccountToGroup(db, "g1", accountId);
    await linkAccountToGroup(db, "g2", accountId);

    const result = await db.select().from(schema.groupAccounts).all();
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.groupId).sort()).toEqual(["g1", "g2"]);
  });

  test("異なるアカウントを同じグループに紐付けできる", async () => {
    await upsertGroup(db, { id: "g1", name: "テストグループ", isCurrent: true });
    const account1 = await createTestAccount("mf1", "銀行1");
    const account2 = await createTestAccount("mf2", "銀行2");

    await linkAccountToGroup(db, "g1", account1);
    await linkAccountToGroup(db, "g1", account2);

    const result = await db.select().from(schema.groupAccounts).all();
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.accountId).sort((a, b) => a - b)).toEqual(
      [account1, account2].sort((a, b) => a - b),
    );
  });
});
