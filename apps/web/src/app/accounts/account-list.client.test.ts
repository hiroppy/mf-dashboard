import { describe, expect, it } from "vitest";
import { countSuspended, filterSuspended } from "./account-list.client";

type Account = {
  id: number;
  mfId: string;
  name: string;
  type: string;
  status: "ok" | "error" | "updating" | "suspended" | "unknown";
  lastUpdated: string | null;
  totalAssets: number;
  categoryId: number | null;
  categoryName: string;
  categoryDisplayOrder: number;
};

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    mfId: "acc-1",
    name: "口座A",
    type: "自動連携",
    status: "ok",
    lastUpdated: null,
    totalAssets: 0,
    categoryId: 1,
    categoryName: "銀行",
    categoryDisplayOrder: 1,
    ...overrides,
  };
}

const baseGrouped = [
  {
    categoryName: "銀行",
    displayOrder: 1,
    accounts: [makeAccount({ id: 1, status: "ok" }), makeAccount({ id: 2, status: "suspended" })],
  },
  {
    categoryName: "クレジットカード",
    displayOrder: 2,
    accounts: [makeAccount({ id: 3, status: "suspended" })],
  },
  {
    categoryName: "証券",
    displayOrder: 3,
    accounts: [makeAccount({ id: 4, status: "error" })],
  },
];

describe("countSuspended", () => {
  it("suspended アカウントの件数を返す", () => {
    expect(countSuspended(baseGrouped)).toBe(2);
  });

  it("suspended が0件の場合は0を返す", () => {
    const groups = [
      {
        categoryName: "銀行",
        displayOrder: 1,
        accounts: [makeAccount({ status: "ok" }), makeAccount({ status: "error" })],
      },
    ];
    expect(countSuspended(groups)).toBe(0);
  });

  it("空配列の場合は0を返す", () => {
    expect(countSuspended([])).toBe(0);
  });
});

describe("filterSuspended", () => {
  it("suspended アカウントを除外する", () => {
    const result = filterSuspended(baseGrouped);
    const bankAccounts = result.find((g) => g.categoryName === "銀行")?.accounts;
    expect(bankAccounts).toHaveLength(1);
    expect(bankAccounts?.[0].status).toBe("ok");
  });

  it("suspended のみのカテゴリを除外する", () => {
    const result = filterSuspended(baseGrouped);
    const names = result.map((g) => g.categoryName);
    expect(names).not.toContain("クレジットカード");
  });

  it("suspended でないアカウントのカテゴリは残す", () => {
    const result = filterSuspended(baseGrouped);
    const names = result.map((g) => g.categoryName);
    expect(names).toContain("銀行");
    expect(names).toContain("証券");
  });

  it("空配列の場合は空配列を返す", () => {
    expect(filterSuspended([])).toEqual([]);
  });
});
