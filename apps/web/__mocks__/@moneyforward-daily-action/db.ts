// Storybook mock for @moneyforward-daily-action/db
// Prevents better-sqlite3 (native addon) from being loaded in the browser
import { fn } from "storybook/test";

// Core exports
export const getDb = fn();
export const closeDb = fn();
export const initDb = fn();
export const isDatabaseAvailable = fn(() => true);
export const schema = {};

// Shared utilities - group-filter
export const getDefaultGroupId = fn(() => null);
export const resolveGroupId = fn();
export const getAccountIdsForGroup = fn(() => []);

// Shared utilities - transfer
export const transformTransferToIncome = fn((tx: unknown) => tx);

// Shared utilities - utils
export const generateMonthRange = fn(() => []);

// Query modules - groups
export const getCurrentGroup = fn(() => null);
export const getAllGroups = fn(() => []);

// Query modules - transaction
export const getTransactions = fn(() => []);
export const getTransactionsByMonth = fn(() => []);
export const getTransactionsByAccountId = fn(() => []);

// Query modules - summary
export const buildIncludedTransactionCondition = fn();
export const buildOutsideTransferCondition = fn();
export const buildGroupTransactionCondition = fn();
export const buildRegularIncomeSum = fn();
export const getDeduplicatedTransferIncome = fn(() => 0);
export const buildExpenseSum = fn();
export const getLatestMonthlySummary = fn(() => null);
export const getMonthlySummaries = fn(() => []);
export const getAvailableMonths = fn(() => []);
export const getMonthlySummaryByMonth = fn(() => null);
export const getMonthlyCategoryTotals = fn(() => []);
export const getYearToDateSummary = fn(() => null);
export const getExpenseByFixedVariable = fn(() => ({ fixed: [], variable: [] }));

// Query modules - account
export const getLatestUpdateDate = fn(() => null);
export const normalizeAccount = fn((a: unknown) => a);
export const buildActiveAccountCondition = fn();
export const getAccountsWithAssets = fn(() => []);
export const getAllAccountMfIds = fn(() => []);
export const getAccountByMfId = fn(() => null);
export const groupAccountsByCategory = fn(() => []);
export const getAccountsGroupedByCategory = fn(() => []);

// Query modules - asset
export const parseDateString = fn();
export const toDateString = fn();
export const calculateTargetDate = fn();
export const getAssetBreakdownByCategory = fn(() => []);
export const aggregateLiabilitiesByCategory = fn(() => []);
export const getLiabilityBreakdownByCategory = fn(() => []);
export const getAssetHistory = fn(() => []);
export const getAssetHistoryWithCategories = fn(() => []);
export const getLatestTotalAssets = fn(() => null);
export const getDailyAssetChange = fn(() => null);
export const calculateCategoryChanges = fn(() => []);
export const getCategoryChangesForPeriod = fn(() => null);

// Query modules - holding
export const getLatestSnapshot = fn(() => undefined);
export const buildHoldingWhereCondition = fn();
export const getHoldingsWithLatestValues = fn(() => []);
export const getHoldingsByAccountId = fn(() => []);
export const getHoldingsWithDailyChange = fn(() => []);
export const hasInvestmentHoldings = fn(() => false);

// Query modules - analytics
export const getLatestAnalytics = fn(() => null);
export const getFinancialMetrics = fn(() => null);
export const calculateHealthScore = fn(() => ({ totalScore: 0, categories: [] }));
