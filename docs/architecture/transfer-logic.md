# 振替ロジック

Money Forwardからスクレイピングしたデータにおける振替（transfer）の収支計算ロジックを説明する。

## 背景

Money Forwardでは、振替は以下の2つの形式で記録されることがある：

1. **振替トランザクション** (`type='transfer'`)
2. **通常トランザクション** (`type='expense'` or `type='income'`)

同じ振替が両方の形式で記録される場合があり、重複カウントを避ける必要がある。
収支サマリーでは重複除外を行うが、カテゴリ別表示ではMoney Forward本家の表示に合わせて
重複振替も表示集計に残す。

## 振替の方向と意味

| フィールド                | 意味                                                           |
| ------------------------- | -------------------------------------------------------------- |
| `accountId`               | 振替元アカウント（トランザクションが記録されているアカウント） |
| `transferTargetAccountId` | 振替先アカウント                                               |

## 収支計算ルール

### 収入としてカウント（`getDeduplicatedTransferIncome`）

グループ内→グループ外への振替を収入としてカウントする。

**条件:**

- `type='transfer'`
- `accountId ∈ グループ内`（振替元がグループ内）
- `transferTargetAccountId ∉ グループ内`（振替先がグループ外）
- `hasCommonGroup=false`（振替元と振替先が共通のユーザー定義グループに属していない）

**理由:**
グループ視点で見ると、グループ内アカウントからグループ外への送金記録は「収入」として扱う。
共通グループ判定に必要な `group_accounts` は、対象振替の `accountId` と
`transferTargetAccountId` をまとめて一括取得する。

### 支出としてカウント（`getDeduplicatedTransferExpense`）

グループ外→グループ内への振替を支出としてカウントする。

**条件:**

- `type='transfer'`
- `accountId ∉ グループ内`（振替元がグループ外）
- `transferTargetAccountId ∈ グループ内`（振替先がグループ内）
- `hasCommonGroup=false`（振替元と振替先が共通のユーザー定義グループに属していない）
- **振替先アカウントに同一日・同一金額の通常トランザクションがない**

**理由:**
グループ外からの入金が振替としてのみ記録されている場合、支出としてカウントする。
既に通常トランザクション（expense）として記録されている場合は、重複を避けるため振替はカウントしない。
通常トランザクションの存在判定に必要な `accountId/date/amount` は、対象振替の
`transferTargetAccountId` をまとめて一括取得し、メモリ上のキーで照合する。

### 内部振替（カウントしない）

グループ内→グループ内の振替は収支に影響しないためカウントしない。

## 重複除外

同一の振替が複数回記録されることがあるため、以下のキーで重複除外する：

```
key = `${date}-${amount}-${accountId}-${transferTargetAccountId}`
```

## サマリー集計とカテゴリ別表示の違い

### 収支サマリー

`getMonthlySummaryByMonth()` / `getMonthlySummaries()` / `getYearToDateSummary()` は、
実際の収支としてカウントする値を返す。振替は分類後に重複除外され、通常トランザクションで
既にカウント済みの支出振替も除外される。

### カテゴリ別表示

`getMonthlyCategoryTotals()` はMoney Forward本家の表示差異に合わせた表示用集計を返す。
振替分類にはサマリーと同じ group membership context を使うが、重複除外は行わない。
そのため、同一日・同一金額・同一account・同一transfer_target の振替が複数ある場合、
カテゴリ別表示では複数件分が合算される。

## 具体例

### パターン1: 振替のみ記録

```
振替: Account A (グループ外) → Account B (グループ内) (5,000円)
通常TX: なし
```

→ グループ内で**支出としてカウント**

### パターン2: 振替と通常TX両方記録

```
振替: Account A (グループ外) → Account B (グループ内) (10,000円)
通常TX: Account Bで「振込」(10,000円) as expense
```

→ 通常TXでカウント済みのため、**振替はカウントしない**

### パターン3: 共通グループがある振替

```
振替: Account C (グループX所属) → Account D (グループY所属) (8,000円)
共通グループ: グループZ（両方に所属）
```

→ **内部振替として除外**（共通グループがあるため収支に含めない）

## 関連コード

- `packages/db/src/queries/summary.ts`
  - `getDeduplicatedTransferIncome()`: 振替収入を計算
  - `getDeduplicatedTransferExpense()`: 振替支出を計算
  - transfer classification context: 一括取得済みの group membership で振替分類
  - `hasCommonGroup()`: 2つのアカウントが共通グループに属するか判定
  - `classifyTransfer()`: 振替の収入/支出分類を判定

## 注意点

1. **グループ選択なし（GROUP_NONE_ID="0"）は共通グループとして扱わない**
   - すべてのアカウントが「グループ選択なし」に属するため、これを共通グループとして扱うと全ての振替が内部振替になってしまう

2. **特定のアカウント種別の特別扱いは不要**
   - すべてのアカウントは同じロジックで処理される
   - 特別なフラグやロジックは不要
