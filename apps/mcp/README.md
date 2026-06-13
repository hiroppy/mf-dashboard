# @mf-dashboard/mcp

MCP (Model Context Protocol) サーバー。ローカルの SQLite データベースに対して、Claude Desktop や Claude Code などの MCP クライアントから家計データを照会できる。

## セットアップ

```bash
# ビルド
pnpm --filter @mf-dashboard/mcp build
```

`dist/index.cjs` が生成される。

## Claude Desktop での設定

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "moneyforward": {
      "command": "<node の絶対パス>",
      "args": ["<リポジトリ>/apps/mcp/dist/index.cjs"],
      "env": {
        "DB_PATH": "<リポジトリ>/data/moneyforward.db"
      }
    }
  }
}
```

> `DB_PATH` を省略すると `data/moneyforward.db` がデフォルトで使われる。デモ用には `data/demo.db` を指定する。
> `data/demo.db` がない場合は、先に `pnpm --filter @mf-dashboard/db build:demo` で生成する。

## Claude Code での設定

`.claude/settings.json` または `.mcp.json`:

```json
{
  "mcpServers": {
    "moneyforward": {
      "command": "node",
      "args": ["apps/mcp/dist/index.cjs"],
      "env": {
        "DB_PATH": "data/demo.db"
      }
    }
  }
}
```

## 利用可能なツール

### Financial Tools (`createFinancialTools`)

| ツール名                          | 説明                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| `getAccountsWithAssets`           | 全アクティブ口座と残高・ステータス・金融機関カテゴリを取得 |
| `getAccountsGroupedByCategory`    | 口座をカテゴリ別にグループ化して取得                       |
| `getTransactionsByMonth`          | 指定月の全取引を取得                                       |
| `getTransactionsByAccountId`      | 指定口座の取引履歴を取得                                   |
| `getHoldingsWithLatestValues`     | 全保有銘柄の最新評価額・含み損益を取得                     |
| `getHoldingsWithDailyChange`      | 全保有銘柄の前日比変動を取得                               |
| `getHoldingsByAccountId`          | 指定口座の保有銘柄・評価額・含み損益を取得                 |
| `getMonthlySummaries`             | 月次収支サマリーの一覧を取得                               |
| `getMonthlySummaryByMonth`        | 指定月の収支サマリーを取得                                 |
| `getMonthlyCategoryTotals`        | 指定月のカテゴリ別支出・収入合計を取得                     |
| `getExpenseByFixedVariable`       | 指定月の支出を固定費・変動費に分類して取得                 |
| `getAvailableMonths`              | データが存在する月の一覧を取得                             |
| `getYearToDateSummary`            | 年初来の収支サマリーを取得                                 |
| `getLatestMonthlySummary`         | 最新月の収支サマリーを取得                                 |
| `getAssetBreakdownByCategory`     | 資産をカテゴリ別に分類した内訳を取得                       |
| `getLiabilityBreakdownByCategory` | 負債をカテゴリ別に分類した内訳を取得                       |
| `getAssetHistory`                 | 資産残高の日次推移を取得                                   |
| `getAssetHistoryWithCategories`   | カテゴリ別の資産推移を取得（日次、カテゴリ内訳付き）       |
| `getLatestTotalAssets`            | 最新の総資産額を取得                                       |
| `getDailyAssetChange`             | 前日比の資産変動額を取得                                   |
| `getCategoryChangesForPeriod`     | 指定期間のカテゴリ別資産変動を取得                         |
| `getFinancialMetrics`             | 財務メトリクス（貯蓄率・投資損益・支出傾向等）を一括取得   |
| `getLatestAnalytics`              | 保存済みのAI分析レポートを取得                             |

### Analysis Tools (`createAnalysisTools`)

| ツール名                    | 説明                                                 |
| --------------------------- | ---------------------------------------------------- |
| `analyzeMoMTrend`           | 月次収支の前月比トレンドを分析                       |
| `analyzeSpendingComparison` | カテゴリ別支出を過去平均と比較・異常検出             |
| `analyzePortfolioRisk`      | ポートフォリオのリスク分析（集中度・変動・含み損益） |
| `analyzeSavingsTrajectory`  | 貯蓄の推移分析（緊急予備資金・貯蓄率・目標予測）     |
| `analyzeIncomeStability`    | 収入の安定性分析（変動係数・安定性分類・傾向）       |

## 技術詳細

- トランスポート: stdio
- ビルド: tsdown (CJS format, `better-sqlite3` のネイティブモジュールに合わせて)
- `packages/analytics` の既存ツール定義 (`tool()`) をそのまま再利用
