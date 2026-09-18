// Fixture naming rule (PII-free):
// - Use anonymous, generic fixture names for people and groups (User A, Group A, etc.).
// - Do not encode real person names, nicknames, addresses, phone numbers, emails, or account numbers.
// - Public institution, product, service, and merchant labels are allowed only as non-personal demo labels.
// - Synthetic IDs must use the demo/demo_group prefix and must not resemble real account identifiers.

export const GROUP_ID = "0"; // グループ選択なし（全アカウント）
export const GROUP_ID_INVESTMENT = "demo_group_001"; // 投資グループ
export const GROUP_ID_LIVING = "demo_group_002"; // 生活グループ

export const ALL_GROUP_IDS = [GROUP_ID, GROUP_ID_INVESTMENT, GROUP_ID_LIVING] as const;

const investmentCategories = new Set(["証券", "暗号資産・FX・貴金属", "年金"]);
export const livingCategories = new Set([
  "銀行",
  "カード",
  "電子マネー・プリペイド",
  "ポイント",
  "携帯",
  "通販",
]);

export interface InstitutionCategoryDef {
  name: string;
  order: number;
}

export const institutionCategoryDefs: InstitutionCategoryDef[] = [
  { name: "銀行", order: 1 },
  { name: "証券", order: 2 },
  { name: "暗号資産・FX・貴金属", order: 3 },
  { name: "カード", order: 4 },
  { name: "年金", order: 5 },
  { name: "電子マネー・プリペイド", order: 6 },
  { name: "ポイント", order: 7 },
  { name: "携帯", order: 8 },
  { name: "通販", order: 9 },
  { name: "貯蓄", order: 10 },
];

export const assetCategoryNames = [
  "預金・現金",
  "暗号資産",
  "電子マネー・プリペイド",
  "株式(現物)",
  "投資信託",
  "年金",
  "ポイント",
];

export interface AccountDef {
  name: string;
  type: string;
  institution: string;
  categoryName: string;
}

export const accountDefs: AccountDef[] = [
  {
    name: "三井住友銀行",
    type: "自動連携",
    institution: "三井住友銀行",
    categoryName: "銀行",
  },
  {
    name: "楽天銀行",
    type: "自動連携",
    institution: "楽天銀行",
    categoryName: "銀行",
  },
  {
    name: "住信SBIネット銀行",
    type: "自動連携",
    institution: "住信SBIネット銀行",
    categoryName: "銀行",
  },
  {
    name: "ゆうちょ銀行（貯蓄用）",
    type: "自動連携",
    institution: "ゆうちょ銀行",
    categoryName: "貯蓄",
  },
  {
    name: "SBI証券",
    type: "自動連携",
    institution: "SBI証券",
    categoryName: "証券",
  },
  {
    name: "楽天証券",
    type: "自動連携",
    institution: "楽天証券",
    categoryName: "証券",
  },
  {
    name: "三井住友カード(NL)",
    type: "自動連携",
    institution: "三井住友カード",
    categoryName: "カード",
  },
  {
    name: "楽天カード",
    type: "自動連携",
    institution: "楽天カード",
    categoryName: "カード",
  },
  {
    name: "Suica",
    type: "自動連携",
    institution: "モバイルSuica",
    categoryName: "電子マネー・プリペイド",
  },
  {
    name: "楽天ポイント",
    type: "自動連携",
    institution: "楽天ポイント",
    categoryName: "ポイント",
  },
  {
    name: "iDeCo(SBI証券)",
    type: "自動連携",
    institution: "SBI証券",
    categoryName: "年金",
  },
  {
    name: "ahamo",
    type: "自動連携",
    institution: "ahamo",
    categoryName: "携帯",
  },
  {
    name: "Amazon.co.jp",
    type: "自動連携",
    institution: "Amazon.co.jp",
    categoryName: "通販",
  },
  {
    name: "暗号資産取引所A",
    type: "自動連携",
    institution: "暗号資産取引所A",
    categoryName: "暗号資産・FX・貴金属",
  },
];

export function getGroupsForCategory(categoryName: string): string[] {
  const groups = [GROUP_ID];
  if (investmentCategories.has(categoryName)) {
    groups.push(GROUP_ID_INVESTMENT);
  }
  if (livingCategories.has(categoryName)) {
    groups.push(GROUP_ID_LIVING);
  }
  return groups;
}

export function buildAccountCategoryMap(): Record<string, string> {
  const accountCategoryMap: Record<string, string> = {};
  for (const account of accountDefs) {
    accountCategoryMap[account.name] = account.categoryName;
  }
  return accountCategoryMap;
}

export function getGroupsForAccount(
  accountName: string,
  accountCategoryMap: Record<string, string>,
): string[] {
  return getGroupsForCategory(accountCategoryMap[accountName]);
}
