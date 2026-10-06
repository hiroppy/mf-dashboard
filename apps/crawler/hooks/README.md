# Hooks

スクレイピング完了後に自動実行されるカスタム処理を定義するディレクトリです。

## 仕組み

`hooks/` ディレクトリ内の `.ts` / `.js` ファイルが **ファイル名の昇順** で順番に実行されます。
各 hook は Playwright の `Page` オブジェクトを受け取り、ブラウザ操作を行えます。

- `.` で始まるファイルは無視されます
- 1 つの hook でエラーが発生しても、残りの hook は引き続き実行されます

## hook の作り方

### 1. ファイルを作成する

`hooks/` ディレクトリに TypeScript ファイルを作成します。
実行順を制御するため、ファイル名にプレフィックス番号を付けてください。

```
hooks/
  01-first-hook.ts    # 最初に実行
  02-second-hook.ts   # 次に実行
```

### 2. Hook 関数を実装する

`Hook` 型（`(page: Page) => Promise<void>`）に準拠した関数を `default export` します。

```ts
import type { Hook } from "../src/hooks/types.js";

const hook: Hook = async (page) => {
  // Playwright の Page API を使ってブラウザ操作を行う
  await page.goto("https://moneyforward.com/cf", {
    waitUntil: "domcontentloaded",
  });

  // 任意の処理...
};

export default hook;
```

## ヘルパー関数

`src/hooks/helpers.ts` に共通ユーティリティが用意されています。

| 関数                                                      | 説明                                     |
| --------------------------------------------------------- | ---------------------------------------- |
| `getCsrfToken(page)`                                      | ページから CSRF トークンを取得する       |
| `getTransactionRows(page)`                                | `/cf` ページの取引一覧の行を取得する     |
| `getTransactionId(row)`                                   | 取引行からトランザクション ID を取得する |
| `updateTransactionCategory(page, csrfToken, id, options)` | 取引のカテゴリを API 経由で更新する      |

### 使用例

```ts
import {
  getCsrfToken,
  getTransactionId,
  getTransactionRows,
  updateTransactionCategory,
} from "../src/hooks/helpers.js";
import type { Hook } from "../src/hooks/types.js";

const hook: Hook = async (page) => {
  await page.goto("https://moneyforward.com/cf", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  const csrfToken = await getCsrfToken(page);
  if (!csrfToken) return;

  const rows = getTransactionRows(page);
  const rowCount = await rows.count();

  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    const id = await getTransactionId(row);
    if (!id) continue;

    // カテゴリを更新
    await updateTransactionCategory(page, csrfToken, id, {
      largeCategoryId: "11", // 大カテゴリ ID
      middleCategoryId: "41", // 中カテゴリ ID
    });
  }
};

export default hook;
```

## `updateTransactionCategory` のオプション

| プロパティ         | 型        | 必須 | デフォルト | 説明             |
| ------------------ | --------- | ---- | ---------- | ---------------- |
| `largeCategoryId`  | `string`  | Yes  | —          | 大カテゴリ ID    |
| `middleCategoryId` | `string`  | Yes  | —          | 中カテゴリ ID    |
| `isIncome`         | `boolean` | No   | `false`    | 収入かどうか     |
| `isTarget`         | `boolean` | No   | `true`     | 集計対象かどうか |
