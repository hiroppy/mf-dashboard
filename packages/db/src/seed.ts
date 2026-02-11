/**
 * デモデータ seed スクリプト
 *
 * 独身社会人（30代）を想定した1年間の家計データを生成する。
 * 総資産は約500万円、銀行・証券・カード・電子マネー等すべての項目を網羅し、
 * 収支・振替・取引の整合性を保つ。
 *
 * 使い方:
 *   DB_PATH=../../data/demo.db npx tsx src/seed.ts
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { unlinkSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema/schema";

// ---------------------------------------------------------------------------
// DB 初期化
// ---------------------------------------------------------------------------
const dbPath =
  process.env.DB_PATH || join(import.meta.dirname, "..", "..", "..", "data", "demo.db");

if (existsSync(dbPath)) unlinkSync(dbPath);

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: join(import.meta.dirname, "../drizzle") });

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------
// 冪等性のため固定日時を使用
const FIXED_TIMESTAMP = "2026-02-24T00:00:00.000Z";
const now = () => FIXED_TIMESTAMP;
let mfIdCounter = 0;
const mfId = () => `demo_${String(++mfIdCounter).padStart(6, "0")}`;

/** YYYY-MM-DD */
function dateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** YYYY-MM */
function monthStr(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** シード付き擬似乱数生成器 (mulberry32) — 同じシードで常に同じ結果を返す */
function createRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = createRng(20250201); // 固定シード

/** ランダム整数 [min, max] */
function randInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

/** 配列からランダムに1つ */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(random() * arr.length)];
}

/** 月の日数 */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

// ---------------------------------------------------------------------------
// 定数: 期間設定（冪等性のため固定期間を使用）
// ---------------------------------------------------------------------------
const YEAR_START = 2025;
const MONTH_START = 2; // 2025-02

// 冪等性のため固定日付を使用
const today = new Date("2026-02-24");
const YEAR_END = today.getFullYear();
const MONTH_END = today.getMonth() + 1; // getMonth() は 0-indexed

console.log(
  `期間: ${YEAR_START}-${String(MONTH_START).padStart(2, "0")} 〜 ${YEAR_END}-${String(MONTH_END).padStart(2, "0")}`,
);

function forEachMonth(cb: (y: number, m: number, idx: number) => void): void {
  let idx = 0;
  let y = YEAR_START;
  let m = MONTH_START;
  while (y < YEAR_END || (y === YEAR_END && m <= MONTH_END)) {
    cb(y, m, idx++);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
}

// ---------------------------------------------------------------------------
// 1. グループ
// ---------------------------------------------------------------------------
// 「グループ選択なし」はMoney Forward MEと同じ "0" を使用
// これにより isNoGroup() 関数が正しく動作する
const GROUP_ID = "0"; // グループ選択なし（全アカウント）
const GROUP_ID_INVESTMENT = "demo_group_001"; // 投資グループ
const GROUP_ID_LIVING = "demo_group_002"; // 生活グループ

// グループ選択なし（全アカウント、isCurrent=true）
db.insert(schema.groups)
  .values({
    id: GROUP_ID,
    name: "グループ選択なし",
    isCurrent: true,
    lastScrapedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  })
  .run();

// 投資グループ
db.insert(schema.groups)
  .values({
    id: GROUP_ID_INVESTMENT,
    name: "投資",
    isCurrent: false,
    lastScrapedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  })
  .run();

// 生活グループ
db.insert(schema.groups)
  .values({
    id: GROUP_ID_LIVING,
    name: "生活",
    isCurrent: false,
    lastScrapedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  })
  .run();

// グループ定義: どのカテゴリがどのグループに属するか
const ALL_GROUP_IDS = [GROUP_ID, GROUP_ID_INVESTMENT, GROUP_ID_LIVING] as const;
const investmentCategories = new Set(["証券", "年金"]);
const livingCategories = new Set([
  "銀行",
  "カード",
  "電子マネー・プリペイド",
  "ポイント",
  "携帯",
  "通販",
]);

function getGroupsForCategory(categoryName: string): string[] {
  const groups = [GROUP_ID]; // 全アカウントは常に「グループ選択なし」に属する
  if (investmentCategories.has(categoryName)) {
    groups.push(GROUP_ID_INVESTMENT);
  }
  if (livingCategories.has(categoryName)) {
    groups.push(GROUP_ID_LIVING);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// 2. 機関カテゴリ
// ---------------------------------------------------------------------------
const instCategories = [
  { name: "銀行", order: 1 },
  { name: "証券", order: 2 },
  { name: "暗号資産・FX・貴金属", order: 3 },
  { name: "カード", order: 4 },
  { name: "年金", order: 5 },
  { name: "電子マネー・プリペイド", order: 6 },
  { name: "ポイント", order: 7 },
  { name: "携帯", order: 8 },
  { name: "通販", order: 9 },
  { name: "貯蓄", order: 10 }, // 貯蓄用口座（グループ選択なしのみに所属）
];

const instCatIds: Record<string, number> = {};
for (const ic of instCategories) {
  const ts = now();
  const result = db
    .insert(schema.institutionCategories)
    .values({
      name: ic.name,
      displayOrder: ic.order,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: schema.institutionCategories.id })
    .get();
  instCatIds[ic.name] = result!.id;
}

// ---------------------------------------------------------------------------
// 3. 資産カテゴリ
// ---------------------------------------------------------------------------
const assetCats = ["預金・現金・暗号資産", "株式(現物)", "投資信託", "年金", "ポイント・マイル"];

const assetCatIds: Record<string, number> = {};
for (const name of assetCats) {
  const ts = now();
  const result = db
    .insert(schema.assetCategories)
    .values({
      name,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: schema.assetCategories.id })
    .get();
  assetCatIds[name] = result!.id;
}

// ---------------------------------------------------------------------------
// 4. アカウント
// ---------------------------------------------------------------------------
interface AccountDef {
  name: string;
  type: string;
  institution: string;
  categoryName: string;
}

const accountDefs: AccountDef[] = [
  // 銀行
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
  // 貯蓄用口座（グループ選択なしのみに所属、生活グループには含まれない）
  // NOTE: この口座からの振替は、生活グループから見ると「グループ外からの入金」となり、
  // 収入として扱われる。実際のユースケースとしては貯蓄口座から生活費を補填するパターン。
  {
    name: "ゆうちょ銀行（貯蓄用）",
    type: "自動連携",
    institution: "ゆうちょ銀行",
    categoryName: "貯蓄", // 生活グループには含まれない
  },
  // 証券
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
  // カード
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
  // 電子マネー
  {
    name: "Suica",
    type: "自動連携",
    institution: "モバイルSuica",
    categoryName: "電子マネー・プリペイド",
  },
  // ポイント
  {
    name: "楽天ポイント",
    type: "自動連携",
    institution: "楽天ポイント",
    categoryName: "ポイント",
  },
  // 年金
  {
    name: "iDeCo(SBI証券)",
    type: "自動連携",
    institution: "SBI証券",
    categoryName: "年金",
  },
  // 携帯
  {
    name: "ahamo",
    type: "自動連携",
    institution: "ahamo",
    categoryName: "携帯",
  },
  // 通販
  {
    name: "Amazon.co.jp",
    type: "自動連携",
    institution: "Amazon.co.jp",
    categoryName: "通販",
  },
];

const accountIds: Record<string, number> = {};
for (const a of accountDefs) {
  const ts = now();
  const result = db
    .insert(schema.accounts)
    .values({
      mfId: mfId(),
      name: a.name,
      type: a.type,
      institution: a.institution,
      categoryId: instCatIds[a.categoryName],
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: schema.accounts.id })
    .get();
  accountIds[a.name] = result!.id;

  // Link account to グループ選択なし (all accounts)
  db.insert(schema.groupAccounts)
    .values({
      groupId: GROUP_ID,
      accountId: result!.id,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  // Link to 投資 group if it's an investment account
  if (investmentCategories.has(a.categoryName)) {
    db.insert(schema.groupAccounts)
      .values({
        groupId: GROUP_ID_INVESTMENT,
        accountId: result!.id,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }

  // Link to 生活 group if it's a living-related account
  if (livingCategories.has(a.categoryName)) {
    db.insert(schema.groupAccounts)
      .values({
        groupId: GROUP_ID_LIVING,
        accountId: result!.id,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }
}

// ---------------------------------------------------------------------------
// 5. 保有資産 (Holdings) + アカウントステータス
// ---------------------------------------------------------------------------

// 資産構成 (合計 約5,000,000円)
// - 預金・現金: 約2,300,000 (46%) ※ゆうちょ銀行（貯蓄用）約49万円を含む
// - 投資信託:   約2,000,000 (40%)
// - 株式:        約700,000 (14%)
// - 年金:        約350,000 (7%)
// - ポイント:     約15,000 (0.3%)
// - 電子マネー:   約4,000 (0.1%)
// 負債 (カード利用残高): 約130,000

interface HoldingDef {
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

const holdingDefs: HoldingDef[] = [
  // ---- 預金・現金 ----
  {
    accountName: "三井住友銀行",
    name: "普通預金",
    type: "asset",
    assetCategory: "預金・現金・暗号資産",
    amount: 852481,
  },
  {
    accountName: "楽天銀行",
    name: "普通預金",
    type: "asset",
    assetCategory: "預金・現金・暗号資産",
    amount: 623718,
  },
  {
    accountName: "住信SBIネット銀行",
    name: "SBIハイブリッド預金",
    type: "asset",
    assetCategory: "預金・現金・暗号資産",
    amount: 347592,
  },
  // ---- 貯蓄用口座（グループ選択なしのみに所属） ----
  {
    accountName: "ゆうちょ銀行（貯蓄用）",
    name: "通常貯金",
    type: "asset",
    assetCategory: "預金・現金・暗号資産",
    amount: 487293, // 貯蓄用の残高
  },

  // ---- 投資信託 (amount = quantity × unitPrice) ----
  {
    accountName: "SBI証券",
    name: "eMAXIS Slim 米国株式(S&P500)",
    type: "asset",
    assetCategory: "投資信託",
    amount: 1049966, // 52.3491 × 20057
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
    amount: 580372, // 27.6183 × 21014
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
    amount: 369521, // 152.8842 × 2417
    quantity: 152.8842,
    unitPrice: 2417,
    avgCostPrice: 2158,
    dailyChange: -3200,
    unrealizedGain: 39597,
    unrealizedGainPct: 12.0,
  },

  // ---- 株式 (amount = quantity × unitPrice, 日本株は整数円) ----
  {
    accountName: "SBI証券",
    name: "トヨタ自動車",
    code: "7203",
    type: "asset",
    assetCategory: "株式(現物)",
    amount: 281400, // 100 × 2814
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
    amount: 258700, // 100 × 2587
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
    amount: 162940, // 20 × 8147
    quantity: 20,
    unitPrice: 8147,
    avgCostPrice: 7023,
    dailyChange: 1600,
    unrealizedGain: 22480,
    unrealizedGainPct: 16.0,
  },

  // ---- 年金 ----
  {
    accountName: "iDeCo(SBI証券)",
    name: "eMAXIS Slim バランス(8資産均等型)",
    type: "asset",
    assetCategory: "年金",
    amount: 350038, // 24.8217 × 14102
    quantity: 24.8217,
    unitPrice: 14102,
    avgCostPrice: 12972,
    dailyChange: 2100,
    unrealizedGain: 28050,
    unrealizedGainPct: 8.71,
  },

  // ---- 電子マネー ----
  {
    accountName: "Suica",
    name: "Suica残高",
    type: "asset",
    assetCategory: "預金・現金・暗号資産",
    amount: 3842,
  },

  // ---- ポイント ----
  {
    accountName: "楽天ポイント",
    name: "楽天ポイント残高",
    type: "asset",
    assetCategory: "ポイント・マイル",
    amount: 15237,
  },

  // ---- 負債 (カード利用残高) ----
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

// アカウント名からカテゴリ名を取得するマッピング
const accountCategoryMap: Record<string, string> = {};
for (const a of accountDefs) {
  accountCategoryMap[a.name] = a.categoryName;
}

// アカウント名からグループIDsを取得
function getGroupsForAccount(accountName: string): string[] {
  const categoryName = accountCategoryMap[accountName];
  return getGroupsForCategory(categoryName);
}

// 合計検証
const totalAssets = holdingDefs.filter((h) => h.type === "asset").reduce((s, h) => s + h.amount, 0);
const totalLiabilities = holdingDefs
  .filter((h) => h.type === "liability")
  .reduce((s, h) => s + h.amount, 0);
const netAssets = totalAssets - totalLiabilities;
console.log(
  `資産合計: ¥${totalAssets.toLocaleString()} / 負債合計: ¥${totalLiabilities.toLocaleString()} / 純資産: ¥${netAssets.toLocaleString()}`,
);

// 各グループ用の資産・負債合計を計算
function calcGroupTotals(groupId: string): { assets: number; liabilities: number } {
  let assets = 0;
  let liabilities = 0;
  for (const h of holdingDefs) {
    const groups = getGroupsForAccount(h.accountName);
    if (groups.includes(groupId)) {
      if (h.type === "asset") {
        assets += h.amount;
      } else {
        liabilities += h.amount;
      }
    }
  }
  return { assets, liabilities };
}

// 本番と同様に、スナップショットは1つだけ（グループID "0"）作成
// すべてのholdingValuesをこのスナップショットに紐づける
// グループフィルタリングはaccountIdsで行う
const snapshotDate = dateStr(YEAR_END, MONTH_END, today.getDate());
const snapshotResult = db
  .insert(schema.dailySnapshots)
  .values({
    groupId: GROUP_ID, // "0" = グループ選択なし
    date: snapshotDate,
    createdAt: now(),
    updatedAt: now(),
  })
  .returning({ id: schema.dailySnapshots.id })
  .get();
const snapshotId = snapshotResult!.id;

// アカウントごとの資産合計を集計
const accountTotalAssets: Record<number, number> = {};

for (const h of holdingDefs) {
  const accId = accountIds[h.accountName];
  const catId = h.assetCategory ? assetCatIds[h.assetCategory] : null;
  const ts = now();

  const holdingResult = db
    .insert(schema.holdings)
    .values({
      mfId: mfId(),
      accountId: accId,
      categoryId: catId,
      name: h.name,
      code: h.code ?? null,
      type: h.type,
      liabilityCategory: h.liabilityCategory ?? null,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: schema.holdings.id })
    .get();
  const holdingId = holdingResult!.id;

  // すべてのholdingValuesを1つのスナップショットに紐づける
  // グループフィルタリングはクエリ時にaccountIdsで行う
  db.insert(schema.holdingValues)
    .values({
      holdingId,
      snapshotId,
      amount: h.amount,
      quantity: h.quantity ?? null,
      unitPrice: h.unitPrice ?? null,
      avgCostPrice: h.avgCostPrice ?? null,
      dailyChange: h.dailyChange ?? null,
      unrealizedGain: h.unrealizedGain ?? null,
      unrealizedGainPct: h.unrealizedGainPct ?? null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  // アカウントステータス用に集計
  if (h.type === "asset") {
    accountTotalAssets[accId] = (accountTotalAssets[accId] || 0) + h.amount;
  }
}

// アカウントステータス
for (const a of accountDefs) {
  const accId = accountIds[a.name];
  const ts = now();

  // デモ用: 三井住友カード(NL)はエラー、楽天カードは更新中にする
  let status = "ok";
  let errorMessage: string | null = null;

  if (a.name === "三井住友カード(NL)") {
    status = "error";
    errorMessage = "金融機関のメンテナンス中のため、データを取得できませんでした。";
  } else if (a.name === "楽天カード") {
    status = "updating";
  }

  db.insert(schema.accountStatuses)
    .values({
      accountId: accId,
      status,
      lastUpdated: ts,
      totalAssets: accountTotalAssets[accId] || 0,
      errorMessage,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

// ---------------------------------------------------------------------------
// 6. トランザクション (1年分)
// ---------------------------------------------------------------------------

// 月収 (手取り) 約280,000円
// 月支出 約230,000円 (年間 約2,760,000)
// 月の収支差 約+50,000 → 年間貯蓄 約600,000円

interface TxTemplate {
  category: string;
  subCategory: string;
  description: string;
  type: "income" | "expense" | "transfer";
  minAmount: number;
  maxAmount: number;
  accountName: string;
  frequency: "monthly" | "biweekly" | "weekly" | "random";
  occurrences?: number; // random の場合の月あたり回数
  fixedDay?: number; // monthly の場合の固定日
  isTransfer?: boolean;
  transferTarget?: string;
  isExcludedFromCalculation?: boolean;
  /** 特定の月のみ生成する (1-12)。未指定=毎月 */
  onlyMonths?: number[];
}

const txTemplates: TxTemplate[] = [
  // ==================== 収入 ====================
  {
    category: "収入",
    subCategory: "給与",
    description: "給与振込",
    type: "income",
    minAmount: 265000,
    maxAmount: 295000,
    accountName: "三井住友銀行",
    frequency: "monthly",
    fixedDay: 25,
  },
  {
    category: "収入",
    subCategory: "一時所得",
    description: "夏季賞与",
    type: "income",
    minAmount: 320000,
    maxAmount: 360000,
    accountName: "三井住友銀行",
    frequency: "monthly", // 6月のみ（下で制御）
    fixedDay: 10,
  },
  {
    category: "収入",
    subCategory: "一時所得",
    description: "冬季賞与",
    type: "income",
    minAmount: 450000,
    maxAmount: 500000,
    accountName: "三井住友銀行",
    frequency: "monthly", // 12月のみ（下で制御）
    fixedDay: 10,
  },
  {
    category: "収入",
    subCategory: "利息",
    description: "普通預金利息",
    type: "income",
    minAmount: 5,
    maxAmount: 20,
    accountName: "楽天銀行",
    frequency: "monthly",
    fixedDay: 1,
  },
  {
    category: "収入",
    subCategory: "ポイント・割引",
    description: "楽天ポイント付与",
    type: "income",
    minAmount: 500,
    maxAmount: 2000,
    accountName: "楽天ポイント",
    frequency: "monthly",
    fixedDay: 15,
  },

  // ==================== 固定費 ====================
  {
    category: "住宅",
    subCategory: "家賃・地代",
    description: "家賃",
    type: "expense",
    minAmount: 75000,
    maxAmount: 75000,
    accountName: "三井住友銀行",
    frequency: "monthly",
    fixedDay: 27,
  },
  // 電気代・ガス代は季節変動を onlyMonths で表現
  // 電気代: 夏(7-9)冬(12-2)高め, 春秋安め
  ...[3, 4, 5, 6, 10, 11].map(
    (mo): TxTemplate => ({
      category: "水道・光熱費",
      subCategory: "電気代",
      description: "東京電力 電気代",
      type: "expense",
      minAmount: 3500,
      maxAmount: 5500,
      accountName: "三井住友カード(NL)",
      frequency: "monthly",
      fixedDay: 8,
      onlyMonths: [mo],
    }),
  ),
  ...[7, 8, 9].map(
    (mo): TxTemplate => ({
      category: "水道・光熱費",
      subCategory: "電気代",
      description: "東京電力 電気代",
      type: "expense",
      minAmount: 8000,
      maxAmount: 12000,
      accountName: "三井住友カード(NL)",
      frequency: "monthly",
      fixedDay: 8,
      onlyMonths: [mo],
    }),
  ),
  ...[12, 1, 2].map(
    (mo): TxTemplate => ({
      category: "水道・光熱費",
      subCategory: "電気代",
      description: "東京電力 電気代",
      type: "expense",
      minAmount: 7000,
      maxAmount: 10000,
      accountName: "三井住友カード(NL)",
      frequency: "monthly",
      fixedDay: 8,
      onlyMonths: [mo],
    }),
  ),
  // ガス代: 冬(12-3)高め, 夏安め
  ...[4, 5, 6, 7, 8, 9, 10, 11].map(
    (mo): TxTemplate => ({
      category: "水道・光熱費",
      subCategory: "ガス・灯油代",
      description: "東京ガス ガス代",
      type: "expense",
      minAmount: 2000,
      maxAmount: 3500,
      accountName: "三井住友カード(NL)",
      frequency: "monthly",
      fixedDay: 10,
      onlyMonths: [mo],
    }),
  ),
  ...[12, 1, 2, 3].map(
    (mo): TxTemplate => ({
      category: "水道・光熱費",
      subCategory: "ガス・灯油代",
      description: "東京ガス ガス代",
      type: "expense",
      minAmount: 5000,
      maxAmount: 8000,
      accountName: "三井住友カード(NL)",
      frequency: "monthly",
      fixedDay: 10,
      onlyMonths: [mo],
    }),
  ),
  {
    category: "水道・光熱費",
    subCategory: "水道代",
    description: "水道代",
    type: "expense",
    minAmount: 2000,
    maxAmount: 3500,
    accountName: "三井住友銀行",
    frequency: "monthly",
    fixedDay: 15, // 隔月請求を月ごとにならす
  },
  {
    category: "通信費",
    subCategory: "携帯電話",
    description: "ahamo 月額料金",
    type: "expense",
    minAmount: 2970,
    maxAmount: 2970,
    accountName: "三井住友カード(NL)",
    frequency: "monthly",
    fixedDay: 3,
  },
  {
    category: "通信費",
    subCategory: "インターネット",
    description: "NURO光 月額料金",
    type: "expense",
    minAmount: 5200,
    maxAmount: 5200,
    accountName: "三井住友カード(NL)",
    frequency: "monthly",
    fixedDay: 5,
  },

  // ==================== 変動費 (食費) ====================
  {
    category: "食費",
    subCategory: "食料品",
    description: "",
    type: "expense",
    minAmount: 800,
    maxAmount: 4500,
    accountName: "楽天カード",
    frequency: "random",
    occurrences: 12,
  },
  {
    category: "食費",
    subCategory: "外食",
    description: "",
    type: "expense",
    minAmount: 800,
    maxAmount: 3000,
    accountName: "三井住友カード(NL)",
    frequency: "random",
    occurrences: 6,
  },
  {
    category: "食費",
    subCategory: "カフェ",
    description: "",
    type: "expense",
    minAmount: 300,
    maxAmount: 800,
    accountName: "Suica",
    frequency: "random",
    occurrences: 8,
  },

  // ==================== 変動費 (日用品) ====================
  {
    category: "日用品",
    subCategory: "日用品",
    description: "",
    type: "expense",
    minAmount: 300,
    maxAmount: 3000,
    accountName: "楽天カード",
    frequency: "random",
    occurrences: 4,
  },
  {
    category: "日用品",
    subCategory: "ドラッグストア",
    description: "",
    type: "expense",
    minAmount: 500,
    maxAmount: 2500,
    accountName: "楽天カード",
    frequency: "random",
    occurrences: 2,
  },

  // ==================== 趣味・娯楽 ====================
  {
    category: "趣味・娯楽",
    subCategory: "本",
    description: "",
    type: "expense",
    minAmount: 800,
    maxAmount: 2500,
    accountName: "Amazon.co.jp",
    frequency: "random",
    occurrences: 2,
  },
  {
    category: "趣味・娯楽",
    subCategory: "映画・音楽・ゲーム",
    description: "",
    type: "expense",
    minAmount: 500,
    maxAmount: 2000,
    accountName: "三井住友カード(NL)",
    frequency: "random",
    occurrences: 2,
  },
  {
    category: "趣味・娯楽",
    subCategory: "スポーツ",
    description: "",
    type: "expense",
    minAmount: 1000,
    maxAmount: 5000,
    accountName: "三井住友カード(NL)",
    frequency: "random",
    occurrences: 1,
  },

  // ==================== 衣服・美容 ====================
  {
    category: "衣服・美容",
    subCategory: "衣服",
    description: "",
    type: "expense",
    minAmount: 3000,
    maxAmount: 15000,
    accountName: "楽天カード",
    frequency: "random",
    occurrences: 1,
  },
  {
    category: "衣服・美容",
    subCategory: "美容院・理髪",
    description: "美容院",
    type: "expense",
    minAmount: 4000,
    maxAmount: 5000,
    accountName: "三井住友カード(NL)",
    frequency: "monthly",
    fixedDay: 20,
  },

  // ==================== 交通費 ====================
  {
    category: "交通費",
    subCategory: "電車",
    description: "",
    type: "expense",
    minAmount: 200,
    maxAmount: 500,
    accountName: "Suica",
    frequency: "random",
    occurrences: 8,
  },

  // ==================== 健康・医療 ====================
  {
    category: "健康・医療",
    subCategory: "フィットネス",
    description: "ジム月会費",
    type: "expense",
    minAmount: 8000,
    maxAmount: 8000,
    accountName: "三井住友カード(NL)",
    frequency: "monthly",
    fixedDay: 1,
  },
  {
    category: "健康・医療",
    subCategory: "医療費",
    description: "",
    type: "expense",
    minAmount: 1500,
    maxAmount: 5000,
    accountName: "三井住友カード(NL)",
    frequency: "random",
    occurrences: 1,
  },

  // ==================== 交際費 ====================
  {
    category: "交際費",
    subCategory: "交際費",
    description: "",
    type: "expense",
    minAmount: 3000,
    maxAmount: 8000,
    accountName: "三井住友カード(NL)",
    frequency: "random",
    occurrences: 2,
  },

  // ==================== 教養・教育 ====================
  {
    category: "教養・教育",
    subCategory: "書籍",
    description: "",
    type: "expense",
    minAmount: 1000,
    maxAmount: 3000,
    accountName: "Amazon.co.jp",
    frequency: "random",
    occurrences: 1,
  },

  // ==================== 税・社会保障 ====================
  {
    category: "税・社会保障",
    subCategory: "所得税・住民税",
    description: "住民税",
    type: "expense",
    minAmount: 15000,
    maxAmount: 15000,
    accountName: "三井住友銀行",
    frequency: "monthly",
    fixedDay: 30,
  },

  // ==================== その他 ====================
  {
    category: "その他",
    subCategory: "雑費",
    description: "",
    type: "expense",
    minAmount: 200,
    maxAmount: 2000,
    accountName: "三井住友カード(NL)",
    frequency: "random",
    occurrences: 2,
  },

  // ==================== 季節・臨時イベント ====================
  // GW旅行 (5月)
  {
    category: "趣味・娯楽",
    subCategory: "旅行",
    description: "GW 旅行 宿泊費",
    type: "expense",
    minAmount: 35000,
    maxAmount: 50000,
    accountName: "楽天カード",
    frequency: "random",
    occurrences: 1,
    onlyMonths: [5],
  },
  {
    category: "交通費",
    subCategory: "電車",
    description: "新幹線 往復",
    type: "expense",
    minAmount: 20000,
    maxAmount: 28000,
    accountName: "三井住友カード(NL)",
    frequency: "random",
    occurrences: 1,
    onlyMonths: [5],
  },
  // 夏旅行 (8月)
  {
    category: "趣味・娯楽",
    subCategory: "旅行",
    description: "夏休み旅行 宿泊費",
    type: "expense",
    minAmount: 40000,
    maxAmount: 65000,
    accountName: "楽天カード",
    frequency: "random",
    occurrences: 1,
    onlyMonths: [8],
  },
  {
    category: "趣味・娯楽",
    subCategory: "旅行",
    description: "夏休み旅行 食事・観光",
    type: "expense",
    minAmount: 15000,
    maxAmount: 25000,
    accountName: "三井住友カード(NL)",
    frequency: "random",
    occurrences: 1,
    onlyMonths: [8],
  },
  // 家電買い替え (4月)
  {
    category: "特別な支出",
    subCategory: "家具・家電",
    description: "電子レンジ 買い替え",
    type: "expense",
    minAmount: 25000,
    maxAmount: 35000,
    accountName: "楽天カード",
    frequency: "random",
    occurrences: 1,
    onlyMonths: [4],
  },
  // 年末の出費 (12月)
  {
    category: "交際費",
    subCategory: "プレゼント代",
    description: "クリスマスプレゼント",
    type: "expense",
    minAmount: 10000,
    maxAmount: 20000,
    accountName: "三井住友カード(NL)",
    frequency: "random",
    occurrences: 1,
    onlyMonths: [12],
  },
  {
    category: "交際費",
    subCategory: "交際費",
    description: "忘年会",
    type: "expense",
    minAmount: 5000,
    maxAmount: 8000,
    accountName: "三井住友カード(NL)",
    frequency: "random",
    occurrences: 2,
    onlyMonths: [12],
  },
  // ふるさと納税 (11月)
  {
    category: "税・社会保障",
    subCategory: "その他税・社会保障",
    description: "ふるさと納税",
    type: "expense",
    minAmount: 30000,
    maxAmount: 50000,
    accountName: "楽天カード",
    frequency: "random",
    occurrences: 1,
    onlyMonths: [11],
  },
  // 衣替え (3月, 10月)
  {
    category: "衣服・美容",
    subCategory: "衣服",
    description: "季節の衣類",
    type: "expense",
    minAmount: 8000,
    maxAmount: 20000,
    accountName: "楽天カード",
    frequency: "random",
    occurrences: 1,
    onlyMonths: [3, 10],
  },
  // 健康診断・歯医者 (6月, 9月)
  {
    category: "健康・医療",
    subCategory: "医療費",
    description: "健康診断 自己負担",
    type: "expense",
    minAmount: 5000,
    maxAmount: 8000,
    accountName: "三井住友カード(NL)",
    frequency: "random",
    occurrences: 1,
    onlyMonths: [6],
  },
  {
    category: "健康・医療",
    subCategory: "医療費",
    description: "歯科定期検診",
    type: "expense",
    minAmount: 3000,
    maxAmount: 6000,
    accountName: "三井住友カード(NL)",
    frequency: "random",
    occurrences: 1,
    onlyMonths: [3, 9],
  },
  // 副業・フリマ収入 (3月, 7月, 11月)
  {
    category: "収入",
    subCategory: "事業・副業",
    description: "副業報酬",
    type: "income",
    minAmount: 20000,
    maxAmount: 50000,
    accountName: "楽天銀行",
    frequency: "random",
    occurrences: 1,
    onlyMonths: [3, 7, 11],
  },
  // メルカリ売上 (不定期)
  {
    category: "収入",
    subCategory: "その他入金",
    description: "メルカリ売上",
    type: "income",
    minAmount: 2000,
    maxAmount: 12000,
    accountName: "楽天銀行",
    frequency: "random",
    occurrences: 1,
    onlyMonths: [2, 5, 8, 10],
  },

  // ==================== 振替 ====================
  // NOTE: 貯蓄用口座からの振替は、生活グループから見ると「グループ外からの入金」となり、
  // 収入として扱われる。実際のユースケースとしては貯蓄口座から生活費を補填するパターン。
  // この振替は:
  // - グループ選択なし: 振替として表示（両方のアカウントが見える）
  // - 生活グループ: 収入として表示（貯蓄用口座はグループ外）
  {
    category: "",
    subCategory: "",
    description: "貯蓄口座からの補填",
    type: "transfer",
    minAmount: 28000,
    maxAmount: 47000,
    accountName: "ゆうちょ銀行（貯蓄用）", // 振替元（生活グループ外）
    frequency: "monthly",
    fixedDay: 28,
    isTransfer: true,
    transferTarget: "三井住友銀行", // 振替先（生活グループに所属）
    isExcludedFromCalculation: true,
  },
  {
    category: "",
    subCategory: "",
    description: "楽天銀行へ振替",
    type: "transfer",
    minAmount: 50000,
    maxAmount: 50000,
    accountName: "三井住友銀行",
    frequency: "monthly",
    fixedDay: 26,
    isTransfer: true,
    transferTarget: "楽天銀行",
    isExcludedFromCalculation: true,
  },
  {
    category: "",
    subCategory: "",
    description: "SBI証券へ入金",
    type: "transfer",
    minAmount: 33333,
    maxAmount: 33333,
    accountName: "住信SBIネット銀行",
    frequency: "monthly",
    fixedDay: 1,
    isTransfer: true,
    transferTarget: "SBI証券",
    isExcludedFromCalculation: true,
  },
  {
    category: "",
    subCategory: "",
    description: "Suicaチャージ",
    type: "transfer",
    minAmount: 3000,
    maxAmount: 5000,
    accountName: "三井住友銀行",
    frequency: "monthly",
    fixedDay: 10,
    isTransfer: true,
    transferTarget: "Suica",
    isExcludedFromCalculation: true,
  },
  {
    category: "",
    subCategory: "",
    description: "カード引き落とし",
    type: "transfer",
    minAmount: 80000,
    maxAmount: 120000,
    accountName: "三井住友銀行",
    frequency: "monthly",
    fixedDay: 26,
    isTransfer: true,
    transferTarget: "三井住友カード(NL)",
    isExcludedFromCalculation: true,
  },
  {
    category: "",
    subCategory: "",
    description: "カード引き落とし",
    type: "transfer",
    minAmount: 40000,
    maxAmount: 70000,
    accountName: "楽天銀行",
    frequency: "monthly",
    fixedDay: 27,
    isTransfer: true,
    transferTarget: "楽天カード",
    isExcludedFromCalculation: true,
  },
];

// 食費の具体的な description
const groceryStores = [
  "ライフ",
  "サミット",
  "まいばすけっと",
  "オーケー",
  "イオン",
  "西友",
  "成城石井",
  "業務スーパー",
];
const restaurants = [
  "松屋",
  "すき家",
  "日高屋",
  "サイゼリヤ",
  "ガスト",
  "丸亀製麺",
  "大戸屋",
  "やよい軒",
  "CoCo壱番屋",
  "餃子の王将",
];
const cafes = ["スターバックス", "ドトール", "タリーズ", "コメダ珈琲", "サンマルクカフェ"];
const drugstores = ["マツモトキヨシ", "ウエルシア", "スギ薬局", "ツルハドラッグ"];
const dailyStores = ["ダイソー", "セリア", "無印良品", "ニトリ", "ドン・キホーテ"];
const bookTitles = ["技術書", "新書", "文庫本", "雑誌", "Kindle本"];
const entertainments = ["Netflix", "Spotify", "Steam", "PlayStation Store", "映画館"];
const sports = ["スポーツ用品", "ランニングシューズ", "プロテイン"];
const clothing = ["ユニクロ", "GU", "ZARA", "BEAMS", "UNITED ARROWS", "無印良品"];
const socialEvents = ["飲み会", "送別会", "忘年会", "歓迎会", "同僚とランチ", "友人と食事"];
const medicalDescs = ["歯科", "内科", "皮膚科", "薬局"];
const trainDescs = ["JR東日本", "東京メトロ", "バス"];
const miscDescs = ["コンビニ", "自販機", "クリーニング", "証明写真"];
const educationDescs = ["Udemy", "技術書", "参考書"];

function getDescription(cat: string, subCat: string): string {
  if (cat === "食費" && subCat === "食料品") return pick(groceryStores);
  if (cat === "食費" && subCat === "外食") return pick(restaurants);
  if (cat === "食費" && subCat === "カフェ") return pick(cafes);
  if (cat === "日用品" && subCat === "ドラッグストア") return pick(drugstores);
  if (cat === "日用品" && subCat === "日用品") return pick(dailyStores);
  if (cat === "趣味・娯楽" && subCat === "本") return pick(bookTitles);
  if (cat === "趣味・娯楽" && subCat === "映画・音楽・ゲーム") return pick(entertainments);
  if (cat === "趣味・娯楽" && subCat === "スポーツ") return pick(sports);
  if (cat === "衣服・美容" && subCat === "衣服") return pick(clothing);
  if (cat === "交際費") return pick(socialEvents);
  if (cat === "健康・医療" && subCat === "医療費") return pick(medicalDescs);
  if (cat === "交通費") return pick(trainDescs);
  if (cat === "その他") return pick(miscDescs);
  if (cat === "教養・教育") return pick(educationDescs);
  return "";
}

// トランザクション生成
interface TxRecord {
  mfId: string;
  date: string;
  accountId: number | null;
  accountName: string; // グループ判定用
  category: string | null;
  subCategory: string | null;
  description: string | null;
  amount: number;
  type: string;
  isTransfer: boolean;
  isExcludedFromCalculation: boolean;
  transferTarget: string | null;
  transferTargetAccountId: number | null;
}

const allTransactions: TxRecord[] = [];

// グループ別・月ごとの集計用
type GroupMonthlyData = {
  income: Record<string, number>;
  expense: Record<string, number>;
  catTotals: Record<string, Record<string, { income: number; expense: number }>>;
};
const groupMonthlyData: Record<string, GroupMonthlyData> = {};
for (const gid of ALL_GROUP_IDS) {
  groupMonthlyData[gid] = { income: {}, expense: {}, catTotals: {} };
}

forEachMonth((y, m) => {
  const ms = monthStr(y, m);
  // 各グループの月次データを初期化
  for (const gid of ALL_GROUP_IDS) {
    groupMonthlyData[gid].income[ms] = 0;
    groupMonthlyData[gid].expense[ms] = 0;
    groupMonthlyData[gid].catTotals[ms] = {};
  }

  const maxDay = daysInMonth(y, m);

  for (const tmpl of txTemplates) {
    // 夏季賞与は6月のみ、冬季賞与は12月のみ
    if (tmpl.description === "夏季賞与" && m !== 6) continue;
    if (tmpl.description === "冬季賞与" && m !== 12) continue;

    // onlyMonths フィルタ
    if (tmpl.onlyMonths && !tmpl.onlyMonths.includes(m)) continue;

    const accId = accountIds[tmpl.accountName] ?? null;

    // トランザクションを集計するヘルパー関数
    const addToGroupTotals = (tx: TxRecord, month: string) => {
      if (tx.isExcludedFromCalculation) return;
      const groups = getGroupsForAccount(tx.accountName);
      for (const gid of groups) {
        const data = groupMonthlyData[gid];
        if (tx.type === "income") {
          data.income[month] += tx.amount;
          if (tx.category) {
            if (!data.catTotals[month][tx.category])
              data.catTotals[month][tx.category] = { income: 0, expense: 0 };
            data.catTotals[month][tx.category].income += tx.amount;
          }
        }
        if (tx.type === "expense") {
          data.expense[month] += tx.amount;
          if (tx.category) {
            if (!data.catTotals[month][tx.category])
              data.catTotals[month][tx.category] = { income: 0, expense: 0 };
            data.catTotals[month][tx.category].expense += tx.amount;
          }
        }
      }
    };

    // transferTargetAccountIdをルックアップ
    const transferTargetAccId = tmpl.transferTarget
      ? (accountIds[tmpl.transferTarget] ?? null)
      : null;

    if (tmpl.frequency === "monthly") {
      const day = Math.min(tmpl.fixedDay!, maxDay);
      const amount = randInt(tmpl.minAmount, tmpl.maxAmount);
      const desc = tmpl.description || getDescription(tmpl.category, tmpl.subCategory);

      const tx: TxRecord = {
        mfId: mfId(),
        date: dateStr(y, m, day),
        accountId: accId,
        accountName: tmpl.accountName,
        category: tmpl.category || null,
        subCategory: tmpl.subCategory || null,
        description: desc || null,
        amount,
        type: tmpl.type,
        isTransfer: tmpl.isTransfer ?? false,
        isExcludedFromCalculation: tmpl.isExcludedFromCalculation ?? false,
        transferTarget: tmpl.transferTarget ?? null,
        transferTargetAccountId: transferTargetAccId,
      };
      allTransactions.push(tx);
      addToGroupTotals(tx, ms);
    } else if (tmpl.frequency === "random") {
      const count = tmpl.occurrences ?? 1;
      for (let i = 0; i < count; i++) {
        const day = randInt(1, maxDay);
        const amount = randInt(tmpl.minAmount, tmpl.maxAmount);
        const desc = tmpl.description || getDescription(tmpl.category, tmpl.subCategory);

        const tx: TxRecord = {
          mfId: mfId(),
          date: dateStr(y, m, day),
          accountId: accId,
          accountName: tmpl.accountName,
          category: tmpl.category || null,
          subCategory: tmpl.subCategory || null,
          description: desc || null,
          amount,
          type: tmpl.type,
          isTransfer: tmpl.isTransfer ?? false,
          isExcludedFromCalculation: tmpl.isExcludedFromCalculation ?? false,
          transferTarget: tmpl.transferTarget ?? null,
          transferTargetAccountId: transferTargetAccId,
        };
        allTransactions.push(tx);
        addToGroupTotals(tx, ms);
      }
    }
  }
});

// トランザクションをDBへINSERT (バッチ)
const insertTxBatch = sqlite.transaction(() => {
  for (const tx of allTransactions) {
    const ts = now();
    db.insert(schema.transactions)
      .values({
        mfId: tx.mfId,
        date: tx.date,
        accountId: tx.accountId,
        category: tx.category,
        subCategory: tx.subCategory,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        isTransfer: tx.isTransfer,
        isExcludedFromCalculation: tx.isExcludedFromCalculation,
        transferTarget: tx.transferTarget,
        transferTargetAccountId: tx.transferTargetAccountId,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }
});
insertTxBatch();

console.log(`取引件数: ${allTransactions.length}`);

// Note: monthly_category_totals, monthly_summary, and yearly_summary
// are now calculated dynamically from transactions in the web app

// ---------------------------------------------------------------------------
// 7. asset_history (日次) — 各グループ用にカテゴリごとの成長曲線
// ---------------------------------------------------------------------------

const monthKeys: string[] = [];
forEachMonth((y, m) => monthKeys.push(monthStr(y, m)));

// 各グループの資産・負債を計算
const groupTotals: Record<string, { assets: number; liabilities: number }> = {};
for (const groupId of ALL_GROUP_IDS) {
  groupTotals[groupId] = calcGroupTotals(groupId);
}

// 各グループの月次資産推移を計算
const groupMonthlyAssets: Record<string, Record<string, number>> = {};
for (const groupId of ALL_GROUP_IDS) {
  const { assets: finalAssets } = groupTotals[groupId];
  const monthlyAssets: Record<string, number> = {};
  const incomeData = groupMonthlyData[groupId].income;
  const expenseData = groupMonthlyData[groupId].expense;

  // 最新月（最後の月）から逆算
  monthlyAssets[monthKeys[monthKeys.length - 1]] = finalAssets;
  for (let i = monthKeys.length - 2; i >= 0; i--) {
    const nextMonth = monthKeys[i + 1];
    const thisMonth = monthKeys[i];
    const netIncome = (incomeData[nextMonth] || 0) - (expenseData[nextMonth] || 0);
    // 投資含み益の変動として若干のランダム要素を加える
    const investmentChange = randInt(-20000, 30000);
    monthlyAssets[thisMonth] = monthlyAssets[nextMonth] - netIncome - investmentChange;
  }
  groupMonthlyAssets[groupId] = monthlyAssets;
}

// 日付リストを生成
const dateList: string[] = [];
forEachMonth((y, m) => {
  const maxDay = daysInMonth(y, m);
  for (let d = 1; d <= maxDay; d++) {
    dateList.push(dateStr(y, m, d));
  }
});

// 各グループ用の日次資産データを生成
function generateDailyAssetData(
  groupId: string,
  finalAssets: number,
): { date: string; total: number }[] {
  const monthlyAssets = groupMonthlyAssets[groupId];
  const data: { date: string; total: number }[] = [];

  forEachMonth((y, m, idx) => {
    const ms = monthStr(y, m);
    const maxDay = daysInMonth(y, m);
    const startAsset = monthlyAssets[ms];
    const isLastMonth = idx === monthKeys.length - 1;
    const nextMs = monthKeys[idx + 1];
    const endAsset = isLastMonth ? finalAssets : nextMs ? monthlyAssets[nextMs] : finalAssets;

    for (let d = 1; d <= maxDay; d++) {
      const isFirstDay = d === 1;
      const isLastDay = isLastMonth && d === maxDay;

      if (isFirstDay) {
        data.push({ date: dateStr(y, m, d), total: startAsset });
      } else if (isLastDay) {
        data.push({ date: dateStr(y, m, d), total: finalAssets });
      } else {
        const frac = (d - 1) / maxDay;
        const base = startAsset + (endAsset - startAsset) * frac;
        const noise = randInt(-15000, 15000);
        const total = Math.round(base + noise);
        data.push({ date: dateStr(y, m, d), total });
      }
    }
  });

  return data;
}

// 「グループ選択なし」用のデータ（カテゴリ計算用）
const dailyAssetData = generateDailyAssetData(GROUP_ID, totalAssets);

// カテゴリ別の成長モデル:
//   - 投資信託: 月3から積立開始 (0→最終 ¥2,000,000)
//   - 株式:     月5で初購入、月8で追加購入 (0→最終 ¥700,000)
//   - 年金:     月2からiDeCo積立 (0→最終 ¥350,000)
//   - ポイント:  月1から少額蓄積 (0→最終 ¥15,480)
//   - 預金・現金: total - 他カテゴリ合計 (残り全部)
const TOTAL_DAYS = dailyAssetData.length;

// 最終日のカテゴリ別目標額
const FINAL_FUND = 1999859; // 1,049,966 + 580,372 + 369,521
const FINAL_STOCK = 703040; // 281,400 + 258,700 + 162,940
const FINAL_PENSION = 350038;
const FINAL_POINT = 15237;

// 各カテゴリの「開始日インデックス」を月から算出
// 月idx: 0=2025-02, 1=2025-03, ..., 11=2026-01
function monthStartDayIdx(monthIdx: number): number {
  let dayIdx = 0;
  for (let i = 0; i < monthIdx; i++) {
    const mi = MONTH_START + i;
    const yr = YEAR_START + Math.floor((mi - 1) / 12);
    const mo = ((mi - 1) % 12) + 1;
    dayIdx += daysInMonth(yr, mo);
  }
  return dayIdx;
}

// 投資信託: 月3(idx=1)から開始 → 積立+含み益で成長
const fundStartDay = monthStartDayIdx(1);
// 株式: 月5(idx=3)で¥400k購入、月8(idx=6)で¥300k追加
const stockStartDay = monthStartDayIdx(3);
const stockAddDay = monthStartDayIdx(6);
// 年金: 月2(idx=0)の途中から → ほぼ初月から
const pensionStartDay = monthStartDayIdx(0) + 15; // 月中から
// ポイント: 月1(idx=0)からゆるく蓄積
const pointStartDay = monthStartDayIdx(0);

function categoryAmount(dayIdx: number, finalAmount: number, startDay: number): number {
  if (dayIdx < startDay) return 0;
  const elapsed = dayIdx - startDay;
  const remaining = TOTAL_DAYS - 1 - startDay;
  if (remaining <= 0) return finalAmount;
  // 成長曲線: sqrt で初期の伸びを速くする
  const progress = Math.min(1, elapsed / remaining);
  const base = finalAmount * Math.sqrt(progress);
  // 日次ノイズ（投資は市場変動がある）
  const noise = finalAmount > 100000 ? randInt(-8000, 8000) : randInt(-200, 200);
  return Math.max(0, Math.round(base + noise));
}

function stockAmount(dayIdx: number): number {
  if (dayIdx < stockStartDay) return 0;
  // フェーズ1: 初回購入 ¥400k → 含み益で成長
  const phase1Target = 450000; // ¥400k + 含み益
  const phase2Target = FINAL_STOCK; // 追加購入後の最終額

  if (dayIdx < stockAddDay) {
    // 初回購入〜追加購入前: ¥400k付近で上下
    const elapsed = dayIdx - stockStartDay;
    const duration = stockAddDay - stockStartDay;
    const progress = elapsed / duration;
    const base = 400000 + (phase1Target - 400000) * progress;
    return Math.max(0, Math.round(base + randInt(-10000, 10000)));
  }
  // 追加購入後: ¥700k付近で上下しつつ最終値へ
  const elapsed = dayIdx - stockAddDay;
  const remaining = TOTAL_DAYS - 1 - stockAddDay;
  const progress = elapsed / remaining;
  const base = 650000 + (phase2Target - 650000) * progress;
  return Math.max(0, Math.round(base + randInt(-12000, 12000)));
}

// 預金・現金の最終目標額 (holdings から)
const FINAL_DEPOSIT = totalAssets - FINAL_FUND - FINAL_STOCK - FINAL_PENSION - FINAL_POINT;

// 各グループの最終資産額を計算
const groupFinalAssets: Record<string, number> = {};
for (const gid of ALL_GROUP_IDS) {
  groupFinalAssets[gid] = groupTotals[gid].assets;
}

// 投資グループの最終カテゴリ額
const INVESTMENT_FINAL_FUND = FINAL_FUND;
const INVESTMENT_FINAL_STOCK = FINAL_STOCK;
const INVESTMENT_FINAL_PENSION = FINAL_PENSION;

// 生活グループの最終カテゴリ額
// 生活グループには「貯蓄」カテゴリ（ゆうちょ銀行）は含まれないため、別途計算
const LIVING_DEPOSITS = holdingDefs
  .filter((h) => {
    if (h.type !== "asset") return false;
    if (h.assetCategory !== "預金・現金・暗号資産") return false;
    const cat = accountCategoryMap[h.accountName];
    return livingCategories.has(cat);
  })
  .reduce((s, h) => s + h.amount, 0);
const LIVING_FINAL_DEPOSIT = LIVING_DEPOSITS; // ゆうちょ銀行を除く
const LIVING_FINAL_POINT = FINAL_POINT;

const insertAHBatch = sqlite.transaction(() => {
  // 各グループ用にassetHistoryを生成
  for (const groupId of ALL_GROUP_IDS) {
    const finalAssets = groupFinalAssets[groupId];
    const groupDailyData = generateDailyAssetData(groupId, finalAssets);
    let prevTotal = groupDailyData[0]?.total ?? 0;
    const lastIdx = groupDailyData.length - 1;

    for (let i = 0; i < groupDailyData.length; i++) {
      const { date, total } = groupDailyData[i];
      const change = total - prevTotal;
      const ts = now();

      const ahResult = db
        .insert(schema.assetHistory)
        .values({
          groupId,
          date,
          totalAssets: total,
          change,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning({ id: schema.assetHistory.id })
        .get();
      const ahId = ahResult!.id;

      // グループに応じてカテゴリを計算・挿入
      if (groupId === GROUP_ID) {
        // グループ選択なし: 全カテゴリ
        let fund: number, stock: number, pension: number, point: number, deposit: number;
        if (i === lastIdx) {
          fund = FINAL_FUND;
          stock = FINAL_STOCK;
          pension = FINAL_PENSION;
          point = FINAL_POINT;
          deposit = FINAL_DEPOSIT;
        } else {
          fund = categoryAmount(i, FINAL_FUND, fundStartDay);
          stock = stockAmount(i);
          pension = categoryAmount(i, FINAL_PENSION, pensionStartDay);
          point = categoryAmount(i, FINAL_POINT, pointStartDay);
          deposit = Math.max(0, total - fund - stock - pension - point);
        }

        db.insert(schema.assetHistoryCategories)
          .values({
            assetHistoryId: ahId,
            categoryName: "預金・現金・暗号資産",
            amount: deposit,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();
        if (fund > 0)
          db.insert(schema.assetHistoryCategories)
            .values({
              assetHistoryId: ahId,
              categoryName: "投資信託",
              amount: fund,
              createdAt: ts,
              updatedAt: ts,
            })
            .run();
        if (stock > 0)
          db.insert(schema.assetHistoryCategories)
            .values({
              assetHistoryId: ahId,
              categoryName: "株式(現物)",
              amount: stock,
              createdAt: ts,
              updatedAt: ts,
            })
            .run();
        if (pension > 0)
          db.insert(schema.assetHistoryCategories)
            .values({
              assetHistoryId: ahId,
              categoryName: "年金",
              amount: pension,
              createdAt: ts,
              updatedAt: ts,
            })
            .run();
        if (point > 0)
          db.insert(schema.assetHistoryCategories)
            .values({
              assetHistoryId: ahId,
              categoryName: "ポイント・マイル",
              amount: point,
              createdAt: ts,
              updatedAt: ts,
            })
            .run();
      } else if (groupId === GROUP_ID_INVESTMENT) {
        // 投資グループ: 投資信託、株式、年金
        let fund: number, stock: number, pension: number;
        if (i === lastIdx) {
          fund = INVESTMENT_FINAL_FUND;
          stock = INVESTMENT_FINAL_STOCK;
          pension = INVESTMENT_FINAL_PENSION;
        } else {
          fund = categoryAmount(i, INVESTMENT_FINAL_FUND, fundStartDay);
          stock = stockAmount(i);
          pension = categoryAmount(i, INVESTMENT_FINAL_PENSION, pensionStartDay);
        }

        if (fund > 0)
          db.insert(schema.assetHistoryCategories)
            .values({
              assetHistoryId: ahId,
              categoryName: "投資信託",
              amount: fund,
              createdAt: ts,
              updatedAt: ts,
            })
            .run();
        if (stock > 0)
          db.insert(schema.assetHistoryCategories)
            .values({
              assetHistoryId: ahId,
              categoryName: "株式(現物)",
              amount: stock,
              createdAt: ts,
              updatedAt: ts,
            })
            .run();
        if (pension > 0)
          db.insert(schema.assetHistoryCategories)
            .values({
              assetHistoryId: ahId,
              categoryName: "年金",
              amount: pension,
              createdAt: ts,
              updatedAt: ts,
            })
            .run();
      } else if (groupId === GROUP_ID_LIVING) {
        // 生活グループ: 預金・現金、ポイント
        let deposit: number, point: number;
        if (i === lastIdx) {
          deposit = LIVING_FINAL_DEPOSIT;
          point = LIVING_FINAL_POINT;
        } else {
          point = categoryAmount(i, LIVING_FINAL_POINT, pointStartDay);
          deposit = Math.max(0, total - point);
        }

        db.insert(schema.assetHistoryCategories)
          .values({
            assetHistoryId: ahId,
            categoryName: "預金・現金・暗号資産",
            amount: deposit,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();
        if (point > 0)
          db.insert(schema.assetHistoryCategories)
            .values({
              assetHistoryId: ahId,
              categoryName: "ポイント・マイル",
              amount: point,
              createdAt: ts,
              updatedAt: ts,
            })
            .run();
      }

      prevTotal = total;
    }
  }
});
insertAHBatch();

console.log(`資産履歴日数: ${dailyAssetData.length}`);

// ---------------------------------------------------------------------------
// 8. spending_targets (予算)
// ---------------------------------------------------------------------------

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

// 各グループ用にspendingTargets（固定費/変動費区分）を生成
// 投資グループには予算は不要（収支がないため）、生活グループには全予算を適用
for (const groupId of ALL_GROUP_IDS) {
  // 投資グループは予算対象外
  if (groupId === GROUP_ID_INVESTMENT) continue;

  for (const st of spendingTargetDefs) {
    const ts = now();
    db.insert(schema.spendingTargets)
      .values({
        groupId,
        largeCategoryId: st.largeCategoryId,
        categoryName: st.categoryName,
        type: st.type,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }
}

// ---------------------------------------------------------------------------
// 9. Analytics Reports (from pre-generated LLM insights)
// ---------------------------------------------------------------------------
const insightsPath = join(import.meta.dirname, "fixtures", "demo-insights.json");
if (existsSync(insightsPath)) {
  const insights: Record<string, Record<string, string | null>> = JSON.parse(
    readFileSync(insightsPath, "utf-8"),
  );
  for (const [groupId, data] of Object.entries(insights)) {
    db.insert(schema.analyticsReports)
      .values({
        groupId,
        date: "2026-02-24",
        summary: data.summary,
        savingsInsight: data.savingsInsight,
        investmentInsight: data.investmentInsight,
        spendingInsight: data.spendingInsight,
        balanceInsight: data.balanceInsight,
        liabilityInsight: data.liabilityInsight,
        model: "demo",
        createdAt: now(),
        updatedAt: now(),
      })
      .run();
  }
  console.log(`インサイトデータを挿入しました (${Object.keys(insights).length}グループ)`);
}

// ---------------------------------------------------------------------------
// 完了
// ---------------------------------------------------------------------------
sqlite.close();

// 年間収支を計算（グループ選択なし）
const yearTotalIncome = Object.values(groupMonthlyData[GROUP_ID].income).reduce((s, v) => s + v, 0);
const yearTotalExpense = Object.values(groupMonthlyData[GROUP_ID].expense).reduce(
  (s, v) => s + v,
  0,
);

console.log(`\nデモデータの生成が完了しました: ${dbPath}`);
console.log(`総資産: ¥${totalAssets.toLocaleString()}`);
console.log(`総負債: ¥${totalLiabilities.toLocaleString()}`);
console.log(`純資産: ¥${netAssets.toLocaleString()}`);
console.log(`年間収入合計: ¥${yearTotalIncome.toLocaleString()}`);
console.log(`年間支出合計: ¥${yearTotalExpense.toLocaleString()}`);
