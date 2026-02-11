# Database Schema

```mermaid
erDiagram
    %% マスタ系
    groups {
        text id PK
        text name
        boolean is_current
        text last_scraped_at
        text created_at
        text updated_at
    }

    group_accounts {
        integer id PK
        text group_id FK "INDEX, CASCADE"
        integer account_id FK "INDEX, CASCADE"
        text created_at
        text updated_at
    }

    institution_categories {
        integer id PK
        text name UK
        integer display_order
        text created_at
        text updated_at
    }

    accounts {
        integer id PK
        text mf_id UK
        text name
        text type
        text institution
        integer category_id FK "SET NULL"
        text created_at
        text updated_at
        boolean is_active
    }

    asset_categories {
        integer id PK
        text name UK
        text created_at
        text updated_at
    }

    %% ステータス系
    account_statuses {
        integer id PK
        integer account_id FK,UK "CASCADE"
        text status
        text last_updated
        integer total_assets
        text error_message
        text created_at
        text updated_at
    }

    %% 銘柄・資産マスタ
    holdings {
        integer id PK
        text mf_id UK
        integer account_id FK "INDEX, CASCADE"
        integer category_id FK "SET NULL"
        text name
        text code
        text type
        text liability_category
        text created_at
        text updated_at
        boolean is_active
    }

    %% スナップショット系
    daily_snapshots {
        integer id PK
        text group_id FK "CASCADE"
        text date "INDEX"
        boolean refresh_completed
        text created_at
        text updated_at
    }

    holding_values {
        integer id PK
        integer holding_id FK "CASCADE"
        integer snapshot_id FK "CASCADE"
        integer amount
        real quantity
        real unit_price
        real avg_cost_price
        integer daily_change
        integer unrealized_gain
        real unrealized_gain_pct
        text created_at
        text updated_at
    }

    %% 収支系
    transactions {
        integer id PK
        text mf_id UK
        text date "INDEX"
        integer account_id FK "INDEX, CASCADE"
        text category
        text sub_category
        text description
        integer amount
        text type
        boolean is_transfer
        boolean is_excluded_from_calculation
        text transfer_target
        integer transfer_target_account_id FK "SET NULL"
        text created_at
        text updated_at
    }

    %% 資産履歴系
    asset_history {
        integer id PK
        text group_id FK "INDEX, CASCADE"
        text date
        integer total_assets
        integer change
        text created_at
        text updated_at
    }

    asset_history_categories {
        integer id PK
        integer asset_history_id FK "CASCADE"
        text category_name
        integer amount
        text created_at
        text updated_at
    }

    %% 予算系
    spending_targets {
        integer id PK
        text group_id FK "INDEX, CASCADE"
        integer large_category_id
        text category_name
        text type
        text created_at
        text updated_at
    }

    %% 分析系
    analytics_reports {
        integer id PK
        text group_id FK "INDEX, CASCADE"
        text date
        text summary
        text savings_insight
        text investment_insight
        text spending_insight
        text balance_insight
        text liability_insight
        text model
        text created_at
        text updated_at
    }

    %% リレーション
    groups ||--o{ daily_snapshots : "has many (CASCADE)"
    groups ||--o{ group_accounts : "has many (CASCADE)"
    groups ||--o{ asset_history : "has many (CASCADE)"
    groups ||--o{ spending_targets : "has many (CASCADE)"
    groups ||--o{ analytics_reports : "has many (CASCADE)"
    accounts ||--o{ group_accounts : "has many (CASCADE)"
    accounts ||--o{ transactions : "has many (CASCADE)"
    accounts ||--o{ transactions : "transfer target (SET NULL)"
    institution_categories ||--o{ accounts : "has many (SET NULL)"
    accounts ||--o{ holdings : "has many (CASCADE)"
    accounts ||--o| account_statuses : "has one (CASCADE)"
    asset_categories ||--o{ holdings : "has many (SET NULL)"
    holdings ||--o{ holding_values : "has many (CASCADE)"
    daily_snapshots ||--o{ holding_values : "has many (CASCADE)"
    asset_history ||--o{ asset_history_categories : "has many (CASCADE)"
```

## Indexes

| Table                    | Index                                         | Type   | Columns                         |
| ------------------------ | --------------------------------------------- | ------ | ------------------------------- |
| group_accounts           | group_accounts_group_account_idx              | UNIQUE | group_id, account_id            |
| group_accounts           | group_accounts_group_id_idx                   | INDEX  | group_id                        |
| group_accounts           | group_accounts_account_id_idx                 | INDEX  | account_id                      |
| daily_snapshots          | daily_snapshots_date_idx                      | INDEX  | date                            |
| holding_values           | holding_values_holding_snapshot_idx           | UNIQUE | holding_id, snapshot_id         |
| holdings                 | holdings_account_id_idx                       | INDEX  | account_id                      |
| accounts                 | accounts_category_id_idx                      | INDEX  | category_id                     |
| transactions             | transactions_date_idx                         | INDEX  | date                            |
| transactions             | transactions_account_id_idx                   | INDEX  | account_id                      |
| asset_history            | asset_history_group_date_idx                  | UNIQUE | group_id, date                  |
| asset_history            | asset_history_group_id_idx                    | INDEX  | group_id                        |
| asset_history_categories | asset_history_categories_history_category_idx | UNIQUE | asset_history_id, category_name |
| spending_targets         | spending_targets_group_category_idx           | UNIQUE | group_id, large_category_id     |
| spending_targets         | spending_targets_group_id_idx                 | INDEX  | group_id                        |
| analytics_reports        | analytics_reports_group_date_idx              | UNIQUE | group_id, date                  |
| analytics_reports        | analytics_reports_group_id_idx                | INDEX  | group_id                        |

## ON DELETE Actions

| Parent Table           | Child Table              | Action   |
| ---------------------- | ------------------------ | -------- |
| accounts               | account_statuses         | CASCADE  |
| accounts               | holdings                 | CASCADE  |
| accounts               | transactions             | CASCADE  |
| accounts               | transactions (transfer)  | SET NULL |
| accounts               | group_accounts           | CASCADE  |
| groups                 | daily_snapshots          | CASCADE  |
| groups                 | group_accounts           | CASCADE  |
| groups                 | asset_history            | CASCADE  |
| groups                 | spending_targets         | CASCADE  |
| groups                 | analytics_reports        | CASCADE  |
| holdings               | holding_values           | CASCADE  |
| daily_snapshots        | holding_values           | CASCADE  |
| asset_history          | asset_history_categories | CASCADE  |
| institution_categories | accounts                 | SET NULL |
| asset_categories       | holdings                 | SET NULL |
