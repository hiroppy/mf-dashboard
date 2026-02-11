import { relations } from "drizzle-orm";
import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// ============================================================================
// マスタ系
// ============================================================================

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isCurrent: integer("is_current", { mode: "boolean" }).default(false),
  lastScrapedAt: text("last_scraped_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// グループとアカウントの多対多関係を管理する中間テーブル
export const groupAccounts = sqliteTable(
  "group_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("group_accounts_group_account_idx").on(table.groupId, table.accountId),
    index("group_accounts_group_id_idx").on(table.groupId),
    index("group_accounts_account_id_idx").on(table.accountId),
  ],
);

export const institutionCategories = sqliteTable("institution_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  displayOrder: integer("display_order"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const accounts = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mfId: text("mf_id").notNull().unique(),
    name: text("name").notNull(),
    type: text("type").notNull(), // "自動連携" / "手動"
    institution: text("institution"),
    categoryId: integer("category_id").references(() => institutionCategories.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
  },
  (table) => [index("accounts_category_id_idx").on(table.categoryId)],
);

export const assetCategories = sqliteTable("asset_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============================================================================
// ステータス系
// ============================================================================

// アカウントステータス（常に最新状態をupsert）
export const accountStatuses = sqliteTable("account_statuses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // "ok" / "error" / "updating"
  lastUpdated: text("last_updated"), // ISO 8601形式
  totalAssets: integer("total_assets").default(0), // /accountsページから取得した資産額
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============================================================================
// 銘柄・資産マスタ
// ============================================================================

// 銘柄マスタ（資産と負債を統一管理）
// Note: No unique constraint on (accountId, name, type) to allow duplicates
// (e.g., same fund in NISA/特定/一般 accounts)
export const holdings = sqliteTable(
  "holdings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mfId: text("mf_id").unique(), // MFの識別子（ない場合もある）
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => assetCategories.id, {
      onDelete: "set null",
    }), // 負債はnull
    name: text("name").notNull(),
    code: text("code"), // 銘柄コード（株式のみ）
    type: text("type").notNull(), // "asset" | "liability"
    liabilityCategory: text("liability_category"), // 負債の場合のカテゴリ（カード、ローン等）
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
  },
  (table) => [index("holdings_account_id_idx").on(table.accountId)],
);

// ============================================================================
// スナップショット系
// ============================================================================

export const dailySnapshots = sqliteTable(
  "daily_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    refreshCompleted: integer("refresh_completed", { mode: "boolean" }).default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("daily_snapshots_date_idx").on(table.date)],
);

// 銘柄の日次評価額
export const holdingValues = sqliteTable(
  "holding_values",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    holdingId: integer("holding_id")
      .notNull()
      .references(() => holdings.id, { onDelete: "cascade" }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => dailySnapshots.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(), // 評価額
    quantity: real("quantity"), // 数量（株式・投信）
    unitPrice: real("unit_price"), // 単価
    avgCostPrice: real("avg_cost_price"), // 平均取得単価
    dailyChange: integer("daily_change"), // 前日比（円）
    unrealizedGain: integer("unrealized_gain"), // 含み損益
    unrealizedGainPct: real("unrealized_gain_pct"), // 含み損益率
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("holding_values_holding_snapshot_idx").on(table.holdingId, table.snapshotId),
  ],
);

// ============================================================================
// 収支系
// ============================================================================

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mfId: text("mf_id").notNull().unique(),
    date: text("date").notNull(),
    accountId: integer("account_id").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    category: text("category"), // 大項目 null = 振替（カテゴリなし）
    subCategory: text("sub_category"), // 中項目
    description: text("description"),
    amount: integer("amount").notNull(),
    type: text("type").notNull(), // "income" / "expense" / "transfer"
    isTransfer: integer("is_transfer", { mode: "boolean" }).notNull().default(false),
    isExcludedFromCalculation: integer("is_excluded_from_calculation", {
      mode: "boolean",
    })
      .notNull()
      .default(false), // mf-grayout class
    transferTarget: text("transfer_target"),
    transferTargetAccountId: integer("transfer_target_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("transactions_date_idx").on(table.date),
    index("transactions_account_id_idx").on(table.accountId),
  ],
);

// ============================================================================
// 資産履歴系
// ============================================================================

export const assetHistory = sqliteTable(
  "asset_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    totalAssets: integer("total_assets").notNull(),
    change: integer("change").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("asset_history_group_date_idx").on(table.groupId, table.date),
    index("asset_history_group_id_idx").on(table.groupId),
  ],
);

export const assetHistoryCategories = sqliteTable(
  "asset_history_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    assetHistoryId: integer("asset_history_id")
      .notNull()
      .references(() => assetHistory.id, { onDelete: "cascade" }),
    categoryName: text("category_name").notNull(),
    amount: integer("amount").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("asset_history_categories_history_category_idx").on(
      table.assetHistoryId,
      table.categoryName,
    ),
  ],
);

// ============================================================================
// 予算系
// ============================================================================

export const spendingTargets = sqliteTable(
  "spending_targets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    largeCategoryId: integer("large_category_id").notNull(),
    categoryName: text("category_name").notNull(),
    type: text("type").notNull(), // "fixed" | "variable"
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("spending_targets_group_category_idx").on(table.groupId, table.largeCategoryId),
    index("spending_targets_group_id_idx").on(table.groupId),
  ],
);

// ============================================================================
// リレーション定義
// ============================================================================

export const groupsRelations = relations(groups, ({ many }) => ({
  snapshots: many(dailySnapshots),
  groupAccounts: many(groupAccounts),
  assetHistories: many(assetHistory),
  spendingTargets: many(spendingTargets),
}));

export const groupAccountsRelations = relations(groupAccounts, ({ one }) => ({
  group: one(groups, {
    fields: [groupAccounts.groupId],
    references: [groups.id],
  }),
  account: one(accounts, {
    fields: [groupAccounts.accountId],
    references: [accounts.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ many, one }) => ({
  holdings: many(holdings),
  status: one(accountStatuses, {
    fields: [accounts.id],
    references: [accountStatuses.accountId],
  }),
  transactions: many(transactions),
  groupAccounts: many(groupAccounts),
}));

export const accountStatusesRelations = relations(accountStatuses, ({ one }) => ({
  account: one(accounts, {
    fields: [accountStatuses.accountId],
    references: [accounts.id],
  }),
}));

export const holdingsRelations = relations(holdings, ({ one, many }) => ({
  account: one(accounts, {
    fields: [holdings.accountId],
    references: [accounts.id],
  }),
  category: one(assetCategories, {
    fields: [holdings.categoryId],
    references: [assetCategories.id],
  }),
  values: many(holdingValues),
}));

export const dailySnapshotsRelations = relations(dailySnapshots, ({ one, many }) => ({
  group: one(groups, {
    fields: [dailySnapshots.groupId],
    references: [groups.id],
  }),
  holdingValues: many(holdingValues),
}));

export const holdingValuesRelations = relations(holdingValues, ({ one }) => ({
  holding: one(holdings, {
    fields: [holdingValues.holdingId],
    references: [holdings.id],
  }),
  snapshot: one(dailySnapshots, {
    fields: [holdingValues.snapshotId],
    references: [dailySnapshots.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
}));

export const assetHistoryRelations = relations(assetHistory, ({ one, many }) => ({
  group: one(groups, {
    fields: [assetHistory.groupId],
    references: [groups.id],
  }),
  categories: many(assetHistoryCategories),
}));

export const assetHistoryCategoriesRelations = relations(assetHistoryCategories, ({ one }) => ({
  assetHistory: one(assetHistory, {
    fields: [assetHistoryCategories.assetHistoryId],
    references: [assetHistory.id],
  }),
}));

export const spendingTargetsRelations = relations(spendingTargets, ({ one }) => ({
  group: one(groups, {
    fields: [spendingTargets.groupId],
    references: [groups.id],
  }),
}));

// ============================================================================
// 分析系
// ============================================================================

export const analyticsReports = sqliteTable(
  "analytics_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    // LLM生成コンテンツ
    summary: text("summary"),
    savingsInsight: text("savings_insight"),
    investmentInsight: text("investment_insight"),
    spendingInsight: text("spending_insight"),
    balanceInsight: text("balance_insight"),
    liabilityInsight: text("liability_insight"),
    // メタデータ
    model: text("model"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("analytics_reports_group_date_idx").on(table.groupId, table.date),
    index("analytics_reports_group_id_idx").on(table.groupId),
  ],
);

export const analyticsReportsRelations = relations(analyticsReports, ({ one }) => ({
  group: one(groups, {
    fields: [analyticsReports.groupId],
    references: [groups.id],
  }),
}));
