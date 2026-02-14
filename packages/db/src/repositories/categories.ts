import type { Db } from "../index";
import { schema } from "../index";
import { getOrCreate } from "../utils";

/**
 * 名前ベースで asset_categories を取得または作成する。
 * normalizeCategory は使わず、スクレイパーが提供する名前をそのまま使う。
 */
export async function getOrCreateCategory(db: Db, name: string): Promise<number> {
  return await getOrCreate(db, schema.assetCategories, schema.assetCategories.name, name);
}
