export interface HoldingDef {
  accountName: string;
  name: string;
  code?: string;
  type: "asset" | "liability";
  assetCategory?: string;
  liabilityCategory?: string;
  amount: number;
  quantity?: number;
  unitPrice?: number;
  avgCostPrice?: number;
  dailyChange?: number;
  unrealizedGain?: number;
  unrealizedGainPct?: number;
}

export const holdingDefs: HoldingDef[] = [
  {
    accountName: "三井住友銀行",
    name: "普通預金",
    type: "asset",
    assetCategory: "預金・現金",
    amount: 852481,
  },
  {
    accountName: "楽天銀行",
    name: "普通預金",
    type: "asset",
    assetCategory: "預金・現金",
    amount: 623718,
  },
  {
    accountName: "住信SBIネット銀行",
    name: "SBIハイブリッド預金",
    type: "asset",
    assetCategory: "預金・現金",
    amount: 347592,
  },
  {
    accountName: "ゆうちょ銀行（貯蓄用）",
    name: "通常貯金",
    type: "asset",
    assetCategory: "預金・現金",
    amount: 487293,
  },
  {
    accountName: "SBI証券",
    name: "eMAXIS Slim 米国株式(S&P500)",
    type: "asset",
    assetCategory: "投資信託",
    amount: 1049966,
    quantity: 52.3491,
    unitPrice: 20057,
    avgCostPrice: 17192,
    dailyChange: 15230,
    unrealizedGain: 149980,
    unrealizedGainPct: 16.66,
  },
  {
    accountName: "SBI証券",
    name: "eMAXIS Slim 全世界株式(オール・カントリー)",
    type: "asset",
    assetCategory: "投資信託",
    amount: 580372,
    quantity: 27.6183,
    unitPrice: 21014,
    avgCostPrice: 18103,
    dailyChange: 8520,
    unrealizedGain: 80398,
    unrealizedGainPct: 16.08,
  },
  {
    accountName: "楽天証券",
    name: "楽天・全米株式インデックス・ファンド",
    type: "asset",
    assetCategory: "投資信託",
    amount: 369521,
    quantity: 152.8842,
    unitPrice: 2417,
    avgCostPrice: 2800,
    dailyChange: -3200,
    unrealizedGain: -58555,
    unrealizedGainPct: -13.68,
  },
  {
    accountName: "SBI証券",
    name: "トヨタ自動車",
    code: "7203",
    type: "asset",
    assetCategory: "株式(現物)",
    amount: 281400,
    quantity: 100,
    unitPrice: 2814,
    avgCostPrice: 2493,
    dailyChange: 2800,
    unrealizedGain: 32100,
    unrealizedGainPct: 12.88,
  },
  {
    accountName: "SBI証券",
    name: "ソニーグループ",
    code: "6758",
    type: "asset",
    assetCategory: "株式(現物)",
    amount: 258700,
    quantity: 100,
    unitPrice: 2587,
    avgCostPrice: 2312,
    dailyChange: -4500,
    unrealizedGain: 27500,
    unrealizedGainPct: 11.9,
  },
  {
    accountName: "楽天証券",
    name: "任天堂",
    code: "7974",
    type: "asset",
    assetCategory: "株式(現物)",
    amount: 162940,
    quantity: 20,
    unitPrice: 8147,
    avgCostPrice: 7023,
    dailyChange: 1600,
    unrealizedGain: 22480,
    unrealizedGainPct: 16,
  },
  {
    accountName: "iDeCo(SBI証券)",
    name: "eMAXIS Slim バランス(8資産均等型)",
    type: "asset",
    assetCategory: "年金",
    amount: 350038,
    quantity: 24.8217,
    unitPrice: 14102,
    avgCostPrice: 12972,
    dailyChange: 2100,
    unrealizedGain: 28050,
    unrealizedGainPct: 8.71,
  },
  {
    accountName: "暗号資産取引所A",
    name: "ビットコイン",
    type: "asset",
    assetCategory: "暗号資産",
    amount: 210000,
    quantity: 0.0321,
    unitPrice: 6542056,
    avgCostPrice: 5900000,
    dailyChange: 3500,
    unrealizedGain: 20610,
    unrealizedGainPct: 10.88,
  },
  {
    accountName: "暗号資産取引所A",
    name: "イーサリアム",
    type: "asset",
    assetCategory: "暗号資産",
    amount: 90000,
    quantity: 0.42,
    unitPrice: 214286,
    avgCostPrice: 190476,
    dailyChange: -1800,
    unrealizedGain: 10000,
    unrealizedGainPct: 12.5,
  },
  {
    accountName: "Suica",
    name: "Suica残高",
    type: "asset",
    assetCategory: "電子マネー・プリペイド",
    amount: 3842,
  },
  {
    accountName: "楽天ポイント",
    name: "楽天ポイント残高",
    type: "asset",
    assetCategory: "ポイント",
    amount: 15237,
  },
  {
    accountName: "三井住友カード(NL)",
    name: "三井住友カード(NL) ご利用残高",
    type: "liability",
    liabilityCategory: "クレジットカード利用残高",
    amount: 76814,
  },
  {
    accountName: "楽天カード",
    name: "楽天カード ご利用残高",
    type: "liability",
    liabilityCategory: "クレジットカード利用残高",
    amount: 53429,
  },
];

export function calculateHoldingTotals() {
  const totalAssets = holdingDefs
    .filter((holding) => holding.type === "asset")
    .reduce((sum, holding) => sum + holding.amount, 0);
  const totalLiabilities = holdingDefs
    .filter((holding) => holding.type === "liability")
    .reduce((sum, holding) => sum + holding.amount, 0);

  return {
    totalAssets,
    totalLiabilities,
    netAssets: totalAssets - totalLiabilities,
  };
}

export function sumAssetCategory(categoryName: string): number {
  return holdingDefs
    .filter((holding) => holding.type === "asset" && holding.assetCategory === categoryName)
    .reduce((sum, holding) => sum + holding.amount, 0);
}

export function calcGroupTotals(
  groupId: string,
  getGroupsForAccount: (accountName: string) => string[],
): { assets: number; liabilities: number } {
  let assets = 0;
  let liabilities = 0;
  for (const holding of holdingDefs) {
    const groups = getGroupsForAccount(holding.accountName);
    if (!groups.includes(groupId)) continue;
    if (holding.type === "asset") {
      assets += holding.amount;
    } else {
      liabilities += holding.amount;
    }
  }
  return { assets, liabilities };
}
