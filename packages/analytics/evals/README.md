# 家計 AI チャット評価

実モデルの tool call とカード出力を、代表的な質問ごとの期待値に照らして評価する。

## 実行

リポジトリルートで demo データを作成し、利用する AI provider の環境変数を設定する。

```sh
pnpm --filter @mf-dashboard/db build:demo
AI_PROVIDER=openai AI_MODEL=<provider-model-id> AI_API_KEY=<provider-api-key> \
  pnpm --filter @mf-dashboard/analytics eval:chat
```

各ケースの使用 tool、カード種別、違反内容を JSON Lines で出力する。全ケース成功時は終了コード 0、1 件以上の失敗時は 1 になる。特定ケースだけを実行する場合は `-- --case=monthly-summary` を付ける。

## ケース追加

`src/evals/finance-chat-cases.ts` に質問、許容する tool 戦略と必須引数、許可する data tool、期待カード順を追加する。共通 scorer は次を検証する。

- 必須 tool と month、date、category、transaction type などの引数
- 許可していない tool や同一 tool/input による重複取得
- `presentFinanceCards` が 1 回だけ成功し、カード schema と期待順を満たすこと
- empty 以外の CTA が、presentation より前の step で完了した `getFinanceDashboardRoute` の返却値であること

評価は実際の AI API を呼び出すため、provider ごとの出力差と利用料金が発生する。
