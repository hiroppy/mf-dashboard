# 家計 AI チャット評価

`promptfoo` で実際の finance chat を呼び、最終テキストと structured cards が代表的な質問の期待値を満たすかを評価する。

## 実行

`eval:chat` は再現可能な fixture として `demo.db` を 2026-07 まで再生成してから評価する。AI provider を設定してリポジトリルートで実行する。

```sh
AI_PROVIDER=openai AI_MODEL=<provider-model-id> AI_API_KEY=<provider-api-key> \
  pnpm --filter @mf-dashboard/analytics eval:chat
```

特定ケースだけを実行する場合は promptfoo の filter を使う。

```sh
pnpm --filter @mf-dashboard/analytics eval:chat --filter-pattern "月次状況"
```

## 構成

- `promptfooconfig.yaml`: provider、prompt、共通設定
- `cases.yaml`: 質問、期待する数値・期間・カテゴリ・カード・route
- `provider.ts`: 本番と同じ model、system prompt、tools で chat を実行し、最終出力を JSON 化
- `assertions.ts`: final text／cards に固有な最小限の判定

ケース追加時は `cases.yaml` に質問と demo fixture 由来の期待値を追加する。tool call の順序や ID ではなく、ユーザーが見る最終回答を評価対象にする。
