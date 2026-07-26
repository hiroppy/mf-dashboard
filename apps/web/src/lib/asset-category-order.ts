const ASSET_CATEGORY_ORDER = [
  "投資信託",
  "株式(現物)",
  "暗号資産",
  "預金・現金",
  "預金・現金・暗号資産",
] as const;

export function compareAssetCategories(a: string, b: string): number {
  const aIndex = ASSET_CATEGORY_ORDER.findIndex((category) => category === a);
  const bIndex = ASSET_CATEGORY_ORDER.findIndex((category) => category === b);
  const aOrder = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
  const bOrder = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
  return aOrder - bOrder;
}

export function sortAssetCategories<T extends { category: string }>(assets: readonly T[]): T[] {
  return [...assets].sort((a, b) => compareAssetCategories(a.category, b.category));
}

export function getAssetCategoryStackOrder(categories: readonly string[]): string[] {
  return [...categories].sort(compareAssetCategories).reverse();
}
