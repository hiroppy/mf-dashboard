# @mf-dashboard/mcp

MCP (Model Context Protocol) サーバー。crawler がローカルの SQLite に保存した家計データを、Codex や Claude Desktop などの MCP クライアントから read-only で照会できる。

## セットアップ

リポジトリルートで依存関係とデモ DB を準備し、MCP サーバーをビルドする。

```bash
pnpm install
pnpm --filter @mf-dashboard/db build:demo
pnpm --filter @mf-dashboard/mcp build
```

ビルド後のエントリーポイントは `apps/mcp/dist/index.cjs`。

## Codex での設定

次の例ではデモ DB を使用する。`/absolute/path/to/mf-dashboard` は、このリポジトリの絶対パスに置き換える。

```bash
codex mcp add moneyforward \
  --env DB_PATH=/absolute/path/to/mf-dashboard/data/demo.db \
  -- node /absolute/path/to/mf-dashboard/apps/mcp/dist/index.cjs
```

設定後、`codex mcp list` で接続状態を確認する。

## Claude Desktop での設定

`~/Library/Application Support/Claude/claude_desktop_config.json` に追加する。

```json
{
  "mcpServers": {
    "moneyforward": {
      "command": "node",
      "args": ["/absolute/path/to/mf-dashboard/apps/mcp/dist/index.cjs"],
      "env": {
        "DB_PATH": "/absolute/path/to/mf-dashboard/data/moneyforward.db"
      }
    }
  }
}
```

`DB_PATH` は必須で、絶対パスを指定する。MCP クライアントの起動ディレクトリに依存しないため、相対パスは受け付けない。個人データを含まない動作確認には `data/demo.db` の絶対パスを指定する。

## 利用可能なツール

`packages/analytics` の既存 tool 定義を MCP tool として公開する。

- Financial tools: 口座・残高、取引履歴、保有資産、月次収支、カテゴリ別集計、資産推移、財務メトリクス
- Analysis tools: 月次収支、支出比較、ポートフォリオリスク、貯蓄推移、収入安定性の分析

すべての tool は呼び出し時点で選択中のグループを解決し、そのグループだけを照会する。MCP サーバーを再起動せずに選択グループを変更できる。MCP サーバーはデータを書き込む tool を公開しない。

## 開発

```bash
DB_PATH=/absolute/path/to/mf-dashboard/data/demo.db pnpm --filter @mf-dashboard/mcp dev
pnpm --filter @mf-dashboard/mcp test
pnpm --filter @mf-dashboard/mcp typecheck
```
