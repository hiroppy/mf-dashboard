interface BalanceSheetAsset {
  category: string;
  amount: number;
}

const ASSET_CATEGORY_ORDER = ["投資信託", "株式(現物)", "預金・現金", "暗号資産"] as const;

function getAssetCategoryOrder(category: string): number {
  const index = ASSET_CATEGORY_ORDER.findIndex((orderedCategory) => orderedCategory === category);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function sortBalanceSheetAssets(assets: BalanceSheetAsset[]): BalanceSheetAsset[] {
  return assets
    .map((asset, index) => ({ asset, index }))
    .sort((a, b) => {
      const aOrder = getAssetCategoryOrder(a.asset.category);
      const bOrder = getAssetCategoryOrder(b.asset.category);
      return aOrder - bOrder || a.index - b.index;
    })
    .map(({ asset }) => asset);
}
