import { describe, test, expect } from "vitest";
import { buildCleanupGroupIds } from "./cleanup-groups.js";
import type { GroupData } from "./scraper.js";
import { NO_GROUP_ID } from "./scrapers/group.js";

function makeGroupData(id: string, name: string): GroupData {
  return {
    group: { id, name, isCurrent: false },
    registeredAccounts: { accounts: [] },
    assetHistory: { points: [] },
    spendingTargets: { categories: [] },
    summary: {
      totalAssets: "0",
      dailyChange: "0",
      dailyChangePercent: "0%",
      monthlyChange: "0",
      monthlyChangePercent: "0%",
    },
    items: [],
  };
}

const noGroupData = makeGroupData(NO_GROUP_ID, "グループ選択なし");

describe("buildCleanupGroupIds", () => {
  test("カスタムグループあり: カスタムグループIDとNO_GROUP_IDを返す", () => {
    const groupDataList: GroupData[] = [
      noGroupData,
      makeGroupData("g1", "グループA"),
      makeGroupData("g2", "グループB"),
    ];

    const result = buildCleanupGroupIds(groupDataList);

    expect(result).not.toBeNull();
    expect(result!.ids).toContain(NO_GROUP_ID);
    expect(result!.ids).toContain("g1");
    expect(result!.ids).toContain("g2");
  });

  test("カスタムグループなし: NO_GROUP_IDのみを返す", () => {
    const groupDataList: GroupData[] = [noGroupData];

    const result = buildCleanupGroupIds(groupDataList);

    expect(result).not.toBeNull();
    expect(result!.ids).toEqual([NO_GROUP_ID]);
  });

  test("空配列: nullを返しクリーンアップをスキップする", () => {
    const result = buildCleanupGroupIds([]);

    expect(result).toBeNull();
  });
});
