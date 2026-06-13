# HIR-77 Refactoring Candidates

mf-dashboard 全体を対象に、コード量削減と堅牢性向上につながるリファクタリング候補を整理する。

## 調査サマリー

変更前の確認結果:

- TypeScript / TSX ファイル: 363 files
- `apps` / `packages` 配下の対象ファイル合計: 46,175 lines
- `pnpm format:check`: pass
- `pnpm turbo typecheck`: pass
- `pnpm lint`: exit 0、既存 warning あり、auto-fix 差分なし
- `pnpm knip`: unused devDependency `lefthook` で exit 1

大きいファイル:

| Lines | File                                                                             |
| ----: | -------------------------------------------------------------------------------- |
| 2,081 | `packages/db/src/seed.ts`                                                        |
| 1,862 | `apps/web/src/components/charts/compound-simulator/compound-simulator.tsx`       |
| 1,513 | `packages/db/src/queries/summary.test.ts`                                        |
| 1,190 | `apps/web/src/components/charts/compound-simulator/simulate-monte-carlo.test.ts` |
|   974 | `apps/web/src/components/charts/compound-simulator/calculate-compound.test.ts`   |
|   695 | `packages/db/src/queries/summary.ts`                                             |

## 優先候補

| Priority | Candidate                             | 主な効果                                       |
| -------- | ------------------------------------- | ---------------------------------------------- |
| P0       | 複利シミュレーター UI の分割          | 1 ファイル集中の解消、hook dependency の堅牢化 |
| P0       | 振替収支計算の N+1 と重複ロジック解消 | DB query 数削減、収支ロジックの変更容易性向上  |
| P1       | 資産履歴カテゴリ取得の一括クエリ化    | 期間表示時の N+1 削減                          |
| P1       | 日付 / 時刻 utility の共通化          | UTC/JST 境界バグの予防、重複削減               |
| P1       | crawler orchestration のフェーズ分割  | 失敗時の復旧性、ログ粒度、テスト容易性向上     |
| P2       | demo seed / repo hygiene の整理       | 巨大 seed の保守性改善、lint/knip debt 削減    |

## P0: 複利シミュレーター UI の分割

### 対象

- `apps/web/src/components/charts/compound-simulator/compound-simulator.tsx`
- `apps/web/src/components/charts/compound-simulator/use-compound-calculator.ts`
- `apps/web/src/components/charts/compound-simulator/use-monte-carlo-simulator.ts`
- `apps/web/src/components/charts/compound-simulator/compound-simulator-utils.ts`

### 問題点

`compound-simulator.tsx` が 1,862 lines あり、次の責務が同居している。

- env default 値の解釈
- timeline 操作 UI
- preset 選択
- 入力フォーム群
- deterministic projection と Monte Carlo の呼び出し
- summary、security score、sensitivity table、chart rendering

また `useCompoundCalculator()` は `Object.values(input)`、`useMonteCarloSimulator()` は `JSON.stringify(input)` を hook dependency として使っている。プロパティ追加時に dependency の意図が読み取りづらく、入力に object / array が増えると再計算条件が不安定になりやすい。

### 推奨リファクタリング

- timeline UI を `interactive-timeline-bar.tsx` へ分離する
- 入力 state と derived values を `use-compound-simulator-state.ts` に寄せる
- 入力フォーム群を `compound-input-panel.tsx` に分離する
- summary / chart / sensitivity 表示を小さな presentational component に分ける
- `components/` 配下へ抽出する component には同じ単位で `*.stories.tsx` を追加する
- hook dependency は明示的な primitive dependency list か、stable input builder に置き換える

### 期待効果

- メイン component を 600 lines 未満に近づけられる
- UI 変更と計算ロジック変更のレビュー範囲を分離できる
- React hook dependency の暗黙性を減らせる

### 検証方針

- `pnpm --filter @mf-dashboard/web test:unit`
- `pnpm --filter @mf-dashboard/web test:storybook`
- `compound-simulator.stories.tsx` の主要 story が現状と同じ入力・出力を描画すること
- 抽出した component ごとに story が追加され、AGENTS.md の story 必須ルールを満たすこと

## P0: 振替収支計算の N+1 と重複ロジック解消

### 対象

- `packages/db/src/queries/summary.ts`
- `docs/architecture/transfer-logic.md`
- `packages/db/src/queries/summary.test.ts`

### 問題点

`summary.ts` は 695 lines あり、振替分類・重複除外・月次/年次/カテゴリ集計が 1 ファイルに集中している。

特に以下の N+1 パターンがある。

- `getDeduplicatedTransferIncome()` が transfer ごとに `classifyTransfer()` を呼び、`hasCommonGroup()` 内で group membership を都度 query する
- `getDeduplicatedTransferExpense()` が transfer ごとに同一日・同一金額の通常 transaction を query する
- `getMonthlyCategoryTotals()` が grouped result ごとに `classifyTransfer()` を呼ぶ

同じ振替分類ルールは `docs/architecture/transfer-logic.md` に整理されているため、実装側も同じ単位で helper 化できる。

### 推奨リファクタリング

- `packages/db/src/queries/transfer-classification.ts` を追加し、group membership と normal transaction keys を一括 prefetch する
- `hasCommonGroup()` の per-call query を、`Map<accountId, Set<groupId>>` ベースの判定に置き換える
- transfer の duplicate key 生成を helper 化する
- transfer 分類結果は共有しつつ、summary の重複除外と category 表示の集計 semantics は分離して維持する

### 期待効果

- transaction 件数に比例する DB round trip を削減できる
- 振替の収入/支出判定ルールが 1 箇所に集約される
- Money Forward 表示差異に関する regression test を追加しやすくなる

### 検証方針

- `pnpm --filter @mf-dashboard/db test -- src/queries/summary.test.ts`
- N+1 削減のため、fake DB ではなく実 DB query 結果で grouped transfer case を増やす
- `docs/architecture/transfer-logic.md` と実装コメントの条件が一致していること

## P1: 資産履歴カテゴリ取得の一括クエリ化

> 実装状況: HIR-77 の追加作業として、`getAssetHistoryWithCategories()` は履歴 ID 群に対する
> `assetHistoryCategories` の一括取得へ変更済み。limit 適用後の履歴だけを対象にし、カテゴリなし履歴は
> `categories: {}` を維持する regression test を追加した。

### 対象

- `packages/db/src/queries/asset.ts`
- `packages/db/src/queries/asset.test.ts`
- `apps/web/src/components/info/asset-history-chart.tsx`

### 問題点

`getAssetHistoryWithCategories()` は asset history を取得したあと、各 history entry ごとに `assetHistoryCategories` を query している。期間が長いほど query 数が増え、asset history chart の server component rendering が重くなりやすい。

### 推奨リファクタリング

- 対象 history IDs を取得後、`inArray(assetHistoryCategories.assetHistoryId, ids)` でカテゴリを一括取得する
- 取得したカテゴリを `Map<assetHistoryId, Record<string, number>>` へまとめる
- `limit` 指定と sort order の既存挙動を維持する

### 期待効果

- asset history 取得を 2 query に固定できる
- chart 表示のデータ取得時間が履歴日数に比例しにくくなる

### 検証方針

- `pnpm --filter @mf-dashboard/db test -- src/queries/asset.test.ts`
- 複数日・複数カテゴリの fixture を追加し、カテゴリ map の欠落がないことを確認する

## P1: 日付 / 時刻 utility の共通化

### 対象

- `apps/web/src/lib/format.ts`
- `apps/web/src/lib/calendar.ts`
- `packages/db/src/queries/asset.ts`
- `packages/db/src/utils.ts`
- `apps/crawler/src/data-builder.ts`
- `apps/crawler/src/index.ts`
- `apps/crawler/src/scraper.ts`
- `packages/analytics/src/analyzer.ts`
- `packages/analytics/src/insights/generator.ts`

### 問題点

日付の扱いが web / db / crawler / analytics に分散している。

- `parseDateString()` が `apps/web/src/lib/calendar.ts` と `packages/db/src/queries/asset.ts` に重複している
- `new Date().toISOString().slice(...)` と JST 表示用 `toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })` が混在している
- financial month / today の基準が UTC なのか JST なのか、関数名から判断しづらい

### 推奨リファクタリング

- `packages/db` または新規 shared utility に、`toIsoDateJst()`, `currentYearMonthJst()`, `parseIsoDateParts()` のような用途別 helper を作る
- UI 表示用 formatter と DB key 生成用 formatter を分ける
- crawler の `updatedAt` 生成を helper 化し、`data-builder.ts`, `index.ts`, legacy `scrape()` で共有する

### 期待効果

- 月初/日付境界の UTC/JST ずれを予防できる
- date parsing のテストを一箇所に集められる
- format helper の重複が減る

### 検証方針

- `pnpm --filter @mf-dashboard/web test:unit -- src/lib/format.test.ts src/lib/calendar.test.ts`
- `pnpm --filter @mf-dashboard/db test -- src/utils.test.ts src/queries/asset.test.ts`
- fake timers で JST の月初・年末ケースを追加する

## P1: crawler orchestration のフェーズ分割

### 対象

- `apps/crawler/src/index.ts`
- `apps/crawler/src/scraper.ts`
- `apps/crawler/src/logger.ts`
- `apps/crawler/src/data-builder.ts`
- `apps/crawler/src/slack.ts`
- `apps/crawler/src/discord.ts`

### 問題点

`apps/crawler/src/index.ts` は setup、auth、scrape、save、cleanup、category sync、history scrape、analytics、notification、error notification を 1 関数で扱っている。失敗時の切り分けやフェーズ単体テストが難しい。

また debug screenshot は `error-${Date.now()}.png` として current working directory に保存されるが、AGENTS.md では crawler screenshot は `apps/crawler/debug/` 配下へ保存する方針になっている。

`apps/crawler/src/scraper.ts` には deprecated `scrape()` が残っている。利用箇所がなければ削除候補。

### 推奨リファクタリング

- `loadCrawlerOptions()`, `runScrapePhase()`, `runSavePhase()`, `runHistoryPhase()`, `runAnalyticsPhase()`, `runNotificationPhase()` に分割する
- error screenshot path を `apps/crawler/debug/` へ寄せる helper を作る
- deprecated `scrape()` の利用有無を `knip` / `rg` で確認し、削除または互換テストを追加する
- crawler の log level は AGENTS.md の方針に合わせ、CI に残すべき進捗だけ `info()` にする

### 期待効果

- crawler の失敗箇所がフェーズ単位で見える
- notification 失敗など非致命的エラーを main flow から分離しやすくなる
- debug artifact の保存場所が統一される

### 検証方針

- `pnpm --filter @mf-dashboard/crawler test`
- `pnpm --filter @mf-dashboard/crawler typecheck`
- `DEBUG=true` 時の screenshot path unit test を追加する

## P2: demo seed / repo hygiene の整理

### 対象

- `packages/db/src/seed.ts`
- `packages/db/src/demo-data.test.ts`
- root `package.json`
- lint warning が出ている UI / test files

### 問題点

`packages/db/src/seed.ts` は 2,081 lines あり、account definitions、holding definitions、transaction templates、asset history、spending target、insight seed、console summary が同居している。

また `pnpm knip` は root `package.json` の `lefthook` を unused devDependency として検出する。ただし `lefthook.yml` は pre-commit / post-merge / post-checkout / post-commit hook を定義しており、`pnpm-workspace.yaml` でも build script が許可されているため、依存削除ではなく knip の false positive として扱う必要がある。`pnpm lint` は exit 0 だが、a11y warning、typed mock warning、conditional expect warning、disabled e2e warning が残っている。

Storybook coverage も機械的に見ると、`components/` 配下に story がない leaf/client component が複数ある。内部 component と公開 component の扱いを明確化しないと、AGENTS.md の「components 配下は story 必須」と衝突し続ける。

### 推奨リファクタリング

- seed data を `seed/accounts.ts`, `seed/holdings.ts`, `seed/transactions.ts`, `seed/asset-history.ts`, `seed/insights.ts` のように責務別へ分割する
- PII を含まない fixture naming rule を seed module に明記する
- `lefthook` は hook 定義が存在するため維持し、`knip` 側に ignore / workspace 設定を追加して false positive を解消する
- lint warning を category ごとに解消する
- story 必須対象を明確化し、必要な leaf component stories を追加する

### 期待効果

- demo data 追加時の差分が小さくなる
- `pnpm knip` を CI で信頼しやすくなる
- Storybook / a11y の regression surface が広がる

### 検証方針

- `pnpm --filter @mf-dashboard/db build:demo`
- `pnpm --filter @mf-dashboard/db test -- src/demo-data.test.ts`
- `pnpm knip`
- `pnpm lint`
- story 追加を伴う場合は `pnpm --filter @mf-dashboard/web test:storybook`

## フォローアップ issue 案

Backlog issue として切り出す対象の案は次の通り。

- `mf-dashboard: 複利シミュレーター UI を分割し状態管理を整理する`
- `mf-dashboard: 振替収支計算の N+1 クエリと重複ロジックを解消する`
- `mf-dashboard: 日付/時刻ユーティリティを共通化し JST/UTC 境界を明確にする`
- `mf-dashboard: crawler の main 処理をフェーズ単位に分割する`
- `mf-dashboard: demo seed と repo hygiene debt を整理する`

各 issue は HIR-77 と `related` でリンクし、実装が HIR-77 の調査結果に依存する場合のみ `blockedBy` を付与する。
