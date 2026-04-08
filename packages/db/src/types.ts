// Types shared between crawler and db package
// Originally defined in scraper.ts, extracted here to avoid circular dependency

// --- Type Constants ---
/** Account type: 自動連携 or 手動 */
export type AccountType = "自動連携" | "手動";

/** Account status */
export type AccountStatusType = "ok" | "error" | "updating" | "suspended" | "unknown";

const ACCOUNT_STATUS_VALUES: readonly string[] = [
  "ok",
  "error",
  "updating",
  "suspended",
  "unknown",
];

export function toAccountStatusType(value: string | null | undefined): AccountStatusType {
  if (value && ACCOUNT_STATUS_VALUES.includes(value)) {
    return value as AccountStatusType;
  }
  return "unknown";
}

/** Holding type: asset or liability */
export type HoldingType = "asset" | "liability";

/** Transaction type */
export type TransactionType = "income" | "expense" | "transfer";

/** Spending target type */
export type SpendingTargetType = "fixed" | "variable";

// --- Cash Flow (/cf) ---
export interface CashFlowItem {
  mfId: string;
  date: string;
  category: string | null; // null = 振替（カテゴリなし）
  subCategory: string | null; // 中項目
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  isTransfer: boolean;
  isExcludedFromCalculation: boolean; // mf-grayout class - 計算に含まない
  transferTarget?: string;
  accountName?: string;
}

export interface CashFlowSummary {
  month: string;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  items: CashFlowItem[];
}

// --- Portfolio (/bs/portfolio) ---
export interface PortfolioItem {
  mfId?: string;
  name: string;
  code?: string; // 銘柄コード（株式のみ）
  type: string;
  institution: string;
  balance: number;
  quantity?: number;
  unitPrice?: number;
  avgCostPrice?: number;
  dailyChange?: number; // 前日比（円）
  unrealizedGain?: number;
  unrealizedGainPct?: number;
}

export interface Portfolio {
  items: PortfolioItem[];
  totalAssets: number;
}

// --- Asset History (/bs/history) ---
export interface AssetHistoryPoint {
  date: string;
  totalAssets: number;
  change: number;
  categories: Record<string, number>; // カテゴリ名 → 金額
}

export interface AssetHistory {
  points: AssetHistoryPoint[];
}

// --- Registered Accounts (/accounts) ---
export interface AccountStatus {
  mfId: string;
  name: string;
  type: string;
  status: AccountStatusType;
  lastUpdated: string;
  url: string;
  totalAssets: number;
  errorMessage?: string;
}

// --- Institution Categories ---
export interface InstitutionCategory {
  id: number;
  name: string;
  displayOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegisteredAccounts {
  accounts: AccountStatus[];
}

// --- Liabilities (/bs/liability) ---
export interface LiabilityItem {
  mfId?: string;
  name: string;
  category: string;
  institution: string;
  balance: number;
}

export interface Liabilities {
  items: LiabilityItem[];
  totalLiabilities: number;
}

// --- Group ---
export interface Group {
  id: string;
  name: string;
  isCurrent: boolean;
  lastScrapedAt?: string;
}

// --- Original Types ---
export interface AssetSummary {
  totalAssets: string;
  dailyChange: string;
  dailyChangePercent: string;
  monthlyChange: string;
  monthlyChangePercent: string;
}

export interface AssetItem {
  name: string;
  balance: string;
  previousBalance: string;
  change: string;
}

// --- Spending Targets (/spending_targets/edit) ---
export interface SpendingTarget {
  largeCategoryId: number;
  name: string;
  type: "fixed" | "variable";
}

export interface SpendingTargetsData {
  categories: SpendingTarget[];
}

// --- Refresh Result ---
export interface RefreshResult {
  completed: boolean;
  incompleteAccounts: string[];
}

// --- Scraped Data ---
export interface ScrapedData {
  summary: AssetSummary;
  items: AssetItem[];
  cashFlow: CashFlowSummary;
  portfolio: Portfolio;
  liabilities: Liabilities;
  assetHistory: AssetHistory;
  registeredAccounts: RegisteredAccounts;
  spendingTargets: SpendingTargetsData | null;
  currentGroup: Group | null;
  refreshResult: RefreshResult | null;
  updatedAt: string;
}
