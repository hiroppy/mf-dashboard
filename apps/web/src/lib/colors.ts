import type { CategoryName } from "@mf-dashboard/meta/categories";

const CATEGORY_VAR_MAP: Record<CategoryName, string> = {
  "預金・現金・暗号資産": "--color-asset-deposit",
  "預金・現金": "--color-asset-deposit",
  暗号資産: "--color-asset-crypto",
  "電子マネー・プリペイド": "--color-asset-prepaid",
  "株式(現物)": "--color-asset-stock",
  投資信託: "--color-asset-fund",
  保険: "--color-asset-insurance",
  年金: "--color-asset-pension",
  "ポイント・マイル": "--color-asset-point",
  ポイント: "--color-asset-point",
  "現金・カード": "--color-cat-cash-card",
  住宅: "--color-cat-housing",
  "水道・光熱費": "--color-cat-utility",
  通信費: "--color-cat-communication",
  自動車: "--color-cat-automobile",
  "税・社会保障": "--color-cat-tax",
  日用品: "--color-cat-daily",
  食費: "--color-cat-food",
  "教養・教育": "--color-cat-education",
  "趣味・娯楽": "--color-cat-entertainment",
  "衣服・美容": "--color-cat-clothing",
  "健康・医療": "--color-cat-health",
  特別な支出: "--color-cat-special",
  その他: "--color-cat-other",
  交通費: "--color-cat-transport",
  交際費: "--color-cat-social",
  収入: "--color-cat-income",
  未分類: "--color-cat-uncategorized",
};

export function getCategoryColor(category: string): string {
  const cssVar = CATEGORY_VAR_MAP[category as CategoryName];
  if (!cssVar) return "var(--color-cat-other)";
  return `var(${cssVar})`;
}

export function getAssetCategoryColor(name: string): string {
  return getCategoryColor(name);
}

export function getChartColorArray(count: number): string[] {
  const vars = [
    "--color-chart-1",
    "--color-chart-2",
    "--color-chart-3",
    "--color-chart-4",
    "--color-chart-5",
  ];
  return Array.from({ length: count }, (_, i) => `var(${vars[i % vars.length]})`);
}

export const semanticColors = {
  income: "var(--color-income)",
  expense: "var(--color-expense)",
  balancePositive: "var(--color-balance-positive)",
  balanceNegative: "var(--color-balance-negative)",
  transfer: "var(--color-transfer)",
  totalAssets: "var(--color-total-assets)",
  liability: "var(--color-liability)",
  netAssets: "var(--color-net-assets)",
} as const;
