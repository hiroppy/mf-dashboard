// ============================================================================
// 大項目 (Large Categories) — MF の固定定義
// ============================================================================

export interface LargeCategory {
  id: number;
  name: string;
}

export const INCOME_LARGE_CATEGORIES = [
  { id: 0, name: "未分類" },
  { id: 1, name: "収入" },
] as const satisfies readonly LargeCategory[];

export const EXPENSE_LARGE_CATEGORIES = [
  { id: 3, name: "現金・カード" },
  { id: 4, name: "住宅" },
  { id: 5, name: "水道・光熱費" },
  { id: 6, name: "通信費" },
  { id: 7, name: "自動車" },
  { id: 8, name: "保険" },
  { id: 9, name: "税・社会保障" },
  { id: 10, name: "日用品" },
  { id: 11, name: "食費" },
  { id: 12, name: "教養・教育" },
  { id: 13, name: "趣味・娯楽" },
  { id: 14, name: "衣服・美容" },
  { id: 15, name: "健康・医療" },
  { id: 16, name: "特別な支出" },
  { id: 18, name: "その他" },
  { id: 20, name: "交通費" },
  { id: 21, name: "交際費" },
] as const satisfies readonly LargeCategory[];

/** 資産カテゴリ名 */
export const ASSET_CATEGORIES = [
  "預金・現金",
  "暗号資産",
  "電子マネー・プリペイド",
  "株式(現物)",
  "投資信託",
  "保険",
  "年金",
  "ポイント・マイル",
  "ポイント",
] as const;

/** 全大項目（収入+支出） */
export const ALL_LARGE_CATEGORIES: readonly LargeCategory[] = [
  ...INCOME_LARGE_CATEGORIES,
  ...EXPENSE_LARGE_CATEGORIES,
];

/** ID → 大項目の名前ルックアップ */
export const LARGE_CATEGORY_NAME_BY_ID: Record<number, string> = Object.fromEntries(
  ALL_LARGE_CATEGORIES.map((c) => [c.id, c.name]),
) as Record<number, string>;

/** 名前 → 大項目 ID のルックアップ */
export const LARGE_CATEGORY_ID_BY_NAME: Record<string, number> = Object.fromEntries(
  ALL_LARGE_CATEGORIES.map((c) => [c.name, c.id]),
) as Record<string, number>;

// ============================================================================
// カテゴリ名のユニオン型
// ============================================================================

export type IncomeCategoryName = (typeof INCOME_LARGE_CATEGORIES)[number]["name"];
export type ExpenseCategoryName = (typeof EXPENSE_LARGE_CATEGORIES)[number]["name"];
export type AssetCategoryName = (typeof ASSET_CATEGORIES)[number];

/** 全カテゴリ名（収入+支出+資産） */
export type CategoryName = IncomeCategoryName | ExpenseCategoryName | AssetCategoryName;
