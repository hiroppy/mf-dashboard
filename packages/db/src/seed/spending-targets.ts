import * as schema from "../schema/schema";
import { ALL_GROUP_IDS, GROUP_ID_INVESTMENT } from "./accounts";
import type { Now, SeedDb } from "./shared";

const spendingTargetDefs: Array<{
  largeCategoryId: number;
  categoryName: string;
  type: "fixed" | "variable";
}> = [
  { largeCategoryId: 1, categoryName: "食費", type: "variable" },
  { largeCategoryId: 2, categoryName: "日用品", type: "variable" },
  { largeCategoryId: 3, categoryName: "趣味・娯楽", type: "variable" },
  { largeCategoryId: 4, categoryName: "衣服・美容", type: "variable" },
  { largeCategoryId: 5, categoryName: "交通費", type: "variable" },
  { largeCategoryId: 6, categoryName: "健康・医療", type: "variable" },
  { largeCategoryId: 7, categoryName: "交際費", type: "variable" },
  { largeCategoryId: 8, categoryName: "教養・教育", type: "variable" },
  { largeCategoryId: 9, categoryName: "住宅", type: "fixed" },
  { largeCategoryId: 10, categoryName: "水道・光熱費", type: "fixed" },
  { largeCategoryId: 11, categoryName: "通信費", type: "fixed" },
  { largeCategoryId: 12, categoryName: "税・社会保障", type: "fixed" },
  { largeCategoryId: 13, categoryName: "その他", type: "variable" },
];

export async function seedSpendingTargets(db: SeedDb, now: Now): Promise<void> {
  for (const groupId of ALL_GROUP_IDS) {
    if (groupId === GROUP_ID_INVESTMENT) continue;

    for (const target of spendingTargetDefs) {
      const ts = now();
      await db
        .insert(schema.spendingTargets)
        .values({
          groupId,
          largeCategoryId: target.largeCategoryId,
          categoryName: target.categoryName,
          type: target.type,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
    }
  }
}
