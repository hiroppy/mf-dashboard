# Codex app-server 調査

## 結論

`codex app-server` は mf-dashboard の作業ディレクトリで起動でき、stdio
経由で初期化、スレッド作成、ターン実行、応答受信まで動作する。

ただし、app-server は rich client を作るための experimental なインターフェースであり、
プロトコルは Codex CLI のバージョンに追従して変わる可能性がある。定型的なジョブや CI
から Codex を実行するだけなら、公式に推奨されている Codex SDK を優先する。

## 検証結果

2026-07-21 に次の環境で確認した。

- Codex CLI: `0.144.6`
- OS: macOS (arm64)
- 認証: ChatGPT で Codex CLI にログイン済み
- transport: stdio（newline-delimited JSON）
- cwd: mf-dashboard の HIR-115 用 worktree

組み込みの V2 テストクライアントを使い、実際にモデルへのターンが完了することを確認した。

```sh
codex login status
codex app-server --help
codex debug app-server send-message-v2 \
  'Reply with exactly HIR-115-OK. Do not call tools.'
```

確認できたライフサイクルは次のとおり。

1. `initialize` に成功し、`initialized` を送信
2. `thread/start` で mf-dashboard を cwd とするスレッドを作成
3. `turn/start` でユーザーメッセージを送信
4. `item/completed` で `HIR-115-OK` を受信
5. `turn/completed` の status が `completed`
6. app-server が exit code 0 で終了

今回のイベント列にはツール呼び出しや `data/moneyforward.db` へのアクセスはなかった。
個人データへアクセスしないことも検証する場合は、対象データへ到達できない OS または
container sandbox を使い、認証だけを設定した隔離済みの `CODEX_HOME` と clean な cwd
（または demo data だけを含む cwd）で再実行する。

## 接続方式

app-server は JSON-RPC 2.0 と同じメッセージ構造を使うが、wire format では
`jsonrpc: "2.0"` を省略する。

| transport   | 用途                                                      | このリポジトリでの評価                                     |
| ----------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| stdio       | app-server を子プロセスとして起動するローカルクライアント | 最小構成として推奨                                         |
| WebSocket   | 別プロセスまたは別ホストから接続する rich client          | experimental/unsupported。公開範囲ごとの認証と暗号化が必要 |
| Unix socket | 同一ホスト上のプロセス間接続                              | 複数クライアントや daemon 化が必要な場合の候補             |

クライアントは接続ごとに一度だけ `initialize` を送り、その応答後に `initialized`
notification を送る。その後で `thread/start` と `turn/start` を呼び、
`turn/completed` まで notification を読み続ける必要がある。approval や permission
などの server-initiated request も処理して応答しなければ、ターンを継続できない。

WebSocket の公開境界は次のように分ける。

- localhost: `ws://127.0.0.1:PORT` に bind する。全 local process を信頼できない shared host
  では `--ws-auth capability-token --ws-token-file /absolute/path` も設定する
- SSH tunnel: app-server は loopback に bind したままにし、SSH tunnel で暗号化する。
  `--ws-auth capability-token --ws-token-file /absolute/path` も設定する
- 公開到達可能な接続: app-server を直接公開しない。loopback に bind して TLS 終端 proxy
  の内側へ置き、client は `wss://` で接続する。app-server 側にも `--ws-auth` を設定する

型定義は使用中の CLI と同じバージョンから生成する。

```sh
codex app-server generate-ts --experimental --out ./schemas
codex app-server generate-json-schema --experimental --out ./schemas
```

生成物は CLI バージョン固有である。リポジトリへクライアントを実装する場合は、CLI
の更新と schema の更新を同じ変更として扱い、互換性テストを行う。

## mf-dashboard で利用する場合

analytics package では `AI_BACKEND` によって AI SDK と app-server を選択できる。

| `AI_BACKEND`       | 実行経路                                                   |
| ------------------ | ---------------------------------------------------------- |
| `ai-sdk`（既定値） | `AI_PROVIDER`、`AI_MODEL`、`AI_API_KEY` で AI SDK を利用   |
| `codex-app-server` | ログイン済み Codex CLI を子プロセスとして stdio 経由で利用 |

app-server 経路は接続ごとに ephemeral thread を作成し、read-only sandbox と
`approvalPolicy: "never"` を指定する。既存の Zod output schema は `outputSchema`、
AI SDK tool 定義は experimental な `dynamicTools` に変換し、tool の実行結果だけを
app-server へ返す。insights と未分類取引の categorization は同じ生成境界を使うため、
AI SDK の既存経路を変更せず切り替えられる。

`CODEX_APP_SERVER_TIMEOUT_MS` は接続全体の timeout で、既定値は 120 秒。
成功、失敗、timeout のいずれでも子プロセスの stdin を閉じて終了させる。

app-server を使う価値があるのは、会話履歴、承認 UI、ツール実行、ストリーミングイベントを
ダッシュボードへ統合する場合である。その場合は Next.js のリクエスト処理から都度起動せず、
認証済みのローカル backend プロセスが app-server を管理し、Web アプリには必要なイベントだけを
中継する構成が適している。

前提条件と制約は次のとおり。

- Codex CLI のインストールと、ChatGPT ログイン、`codex login --with-api-key` で登録した
  OpenAI API key、または `codex login --with-access-token` で登録した trusted automation 用の
  `CODEX_ACCESS_TOKEN` のいずれかが必要
- app-server のクライアント認証と、Codex が上流 API に接続するための認証は別物
- WebSocket は loopback に限定し、接続境界に応じて SSH または TLS と `--ws-auth` を使う
- experimental API を使う場合は `initialize` で明示的に opt-in する必要がある
- notification にはコマンド出力、ファイル変更、ローカルパスなどが含まれ得るため、
  ブラウザへの転送とログ保存では allowlist と秘匿化が必要
- app-server は開発・デバッグ用途が主で、予告なく変わる可能性がある

今回の単一 stdio CLI 検証の範囲では技術的な blocker を確認しなかった。本番 client
統合、長時間負荷、WebSocket の実動作は未検証である。定型実行だけが目的なら SDK の方が
安定性と保守性に優れる。

## 参考資料

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex CLI developer commands](https://learn.chatgpt.com/docs/developer-commands)
- [openai/codex app-server source](https://github.com/openai/codex/tree/main/codex-rs/app-server)
