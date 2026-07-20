# Codex app-server 調査

## 結論

`codex app-server` は mf-dashboard の作業ディレクトリで起動でき、stdio
経由で初期化、スレッド作成、ターン実行、応答のストリーミングまで動作する。

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

このコマンドは個人データや `data/moneyforward.db` を参照しないため、そのまま再検証できる。

## 接続方式

app-server は JSON-RPC 2.0 と同じメッセージ構造を使うが、wire format では
`jsonrpc: "2.0"` を省略する。

| transport   | 用途                                                      | このリポジトリでの評価                                           |
| ----------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| stdio       | app-server を子プロセスとして起動するローカルクライアント | 最小構成として推奨                                               |
| WebSocket   | 別プロセスまたは別ホストから接続する rich client          | experimental/unsupported。localhost または SSH tunnel に限定する |
| Unix socket | 同一ホスト上のプロセス間接続                              | 複数クライアントや daemon 化が必要な場合の候補                   |

クライアントは接続ごとに一度だけ `initialize` を送り、その応答後に `initialized`
notification を送る。その後で `thread/start` と `turn/start` を呼び、
`turn/completed` まで notification を読み続ける必要がある。

型定義は使用中の CLI と同じバージョンから生成する。

```sh
codex app-server generate-ts --out ./schemas
codex app-server generate-json-schema --out ./schemas
```

生成物は CLI バージョン固有である。リポジトリへクライアントを実装する場合は、CLI
の更新と schema の更新を同じ変更として扱い、互換性テストを行う。

## mf-dashboard で利用する場合

app-server を使う価値があるのは、会話履歴、承認 UI、ツール実行、ストリーミングイベントを
ダッシュボードへ統合する場合である。その場合は Next.js のリクエスト処理から都度起動せず、
認証済みのローカル backend プロセスが app-server を管理し、Web アプリには必要なイベントだけを
中継する構成が適している。

前提条件と制約は次のとおり。

- Codex CLI のインストールと、ChatGPT ログインまたは trusted automation 用の
  `CODEX_ACCESS_TOKEN` が必要
- app-server のクライアント認証と、Codex が上流 API に接続するための認証は別物
- stdio 以外で非 localhost に公開する場合は、TLS と WebSocket 認証が必要
- experimental API を使う場合は `initialize` で明示的に opt-in する必要がある
- notification にはコマンド出力、ファイル変更、ローカルパスなどが含まれ得るため、
  ブラウザへの転送とログ保存では allowlist と秘匿化が必要
- app-server は開発・デバッグ用途が主で、予告なく変わる可能性がある

現時点では app-server 自体の動作を確認できたため、採用可否を妨げる技術的な blocker はない。
一方、定型実行だけが目的なら SDK の方が安定性と保守性に優れる。

## 参考資料

- [Codex App Server](https://learn.chatgpt.com/docs/app-server.md)
- [Codex CLI developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli#cli-codex-app-server)
- [openai/codex app-server source](https://github.com/openai/codex/tree/main/codex-rs/app-server)
