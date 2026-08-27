# 個人利用向けのセルフホスト構成

このフォークは、上流の運用前提 (1Password Service Account / Cloudflare Tunnel + Access / Google OAuth) を、自分ひとりが手元で見る用途に合わせて置き換えたものである。

| 上流                          | このフォーク                                               |
| ----------------------------- | ---------------------------------------------------------- |
| 1Password Service Account     | `.env` に資格情報を直接置く                                |
| Cloudflare Tunnel + Terraform | 宅内 LAN へ直接公開し、外出先からは Tailscale 経由で届ける |
| Google OAuth によるログイン   | ログイン無し。到達できる範囲が閲覧できる範囲になる         |

## 前提となる性質

上流のダッシュボードのページには認証チェックが無く、アプリ内で検証しているのは `hasValidCloudflareAccess` の呼び元 2 箇所 (`api/chat` と `api/crawler/refresh`) だけである。エッジの認証を外すということは、**ポートに到達できる者が全資産を無認証で閲覧できる**ということを意味する。

この構成はそれを承知のうえで、到達できる範囲を次の 2 つに定めている。

- 宅内 LAN: `0.0.0.0:8765` で publish する。宅内のどの端末からも無認証で見えるが、それが望ましい使い方だという判断による
- 宅外: Tailscale 経由。`tailscale serve` を使い、`tailscale funnel` は使わない (funnel は公開インターネットへ露出する)

つまり境界は「宅内 LAN に居るか、tailnet に居るか」である。宅内 LAN に信頼できない端末を入れる運用に変わったときは、この前提が崩れるので publish 先を見直すこと。

## 上流からの差分

| パス                                    | 内容                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/crawler/src/auth/credentials.ts`  | `CREDENTIALS_SOURCE` に `env` を指定すると 1Password SDK を呼ばず環境変数から読む。既定は `1password` で上流互換 |
| `apps/web/src/lib/cloudflare-access.ts` | `AUTH_MODE=trusted-network` のとき Access JWT の検証を省く                                                       |
| `compose.override.yml`                  | web を LAN へ publish し、追加した環境変数をコンテナへ渡す                                                       |

`compose.yml`・`terraform/`・`pnpm-lock.yaml` は変更しない。上流を継続的に取り込めるようにするためで、依存パッケージも追加しない。

## 環境変数

`.env.example` をコピーしたうえで、次のように設定する。

```dotenv
# 資格情報を環境変数から読む
CREDENTIALS_SOURCE=env
MF_USERNAME=<Money Forward ME のログイン ID>
MF_PASSWORD=<パスワード>

# ログインを課さない (到達範囲が閲覧範囲になることを承知のうえで)
AUTH_MODE=trusted-network

# 内部 API 用の共有トークン。openssl rand -hex 32 で生成する
REFRESH_TOKEN=<生成した値>

# 公開 URL。Open Graph とクローラー通知に使われる
DASHBOARD_URL=https://<プライベートネットワーク上のホスト名>

# 使わないが compose.yml が必須にしているためダミー値を置く
CLOUDFLARE_ACCESS_AUD=unused
CLOUDFLARE_ACCESS_TEAM_DOMAIN=unused

# 1Password は使わないので空のままでよい
OP_SERVICE_ACCOUNT_TOKEN=
OP_VAULT=
OP_ITEM=
OP_TOTP_FIELD=
```

`compose.yml` は `cloudflared` 用の secret ファイル (`secrets/cloudflared-token`) を宣言しているが、`cloudflared` を起動しない限り存在しなくてよい (`docker compose --dry-run up -d migrate web crawler` で確認済み)。

### ワンタイムコードの手渡し

Money Forward ME は新しい端末からのログインでメールにワンタイムコードを送る。TOTP と違い手元のシークレットからは生成できないため、走行中の crawler へ外から渡す。

crawler はコードを求められると `OTP_CODE_FILE` (既定の compose 設定では `/app/data/otp-code.txt`、ホスト側の `data/otp-code.txt`) を監視し、既定 300 秒 (`OTP_WAIT_TIMEOUT_SECONDS` で変更可) 待つ。ログに待機中である旨が出たら、届いたコードをホスト側から書き込む。

```sh
echo 123456 > data/otp-code.txt
```

- コードは一度きりなので、読み取ったら成否に関わらずファイルを消す
- 待機開始時点で残っているファイルは前回の走行の残骸とみなして捨てる (コードはこの待機が始まった後にしか届かない)
- 一度ログインに成功するとブラウザーのセッションが `crawler_auth_state` ボリュームに保存され、失効するまでは手渡しが要らない

### 手渡しに気付く経路

定時実行の走行が手渡し待ちで止まると、待機上限を過ぎた時点でその日のデータが取れずに終わる。気付ける経路が無いと次の走行かログを見るまで停止に分からないため、待機に入った瞬間に 2 つのことを行う。

- 設定済みの通知先 (Slack / Discord) へ通報する。既存のエラー通知経路へ相乗りしており、どちらも未設定なら何もしない (走行は続く)
- `OTP_EVENT_LOG` (既定は `OTP_CODE_FILE` と同じディレクトリの `otp-events.jsonl`) へ、求められた事実だけを 1 行追記する。コードそのものは書かない

追記した記録は、手渡しを求められる頻度を数えるためのもの。頻度が分かればセッションの寿命を推し量れる。

```sh
# 手渡しを求められた回数と日付
grep wait_started data/otp-events.jsonl | tail -20
```

待機上限は既定 300 秒だが、定時実行で通報に気付いてから応じる余裕を見るなら `OTP_WAIT_TIMEOUT_SECONDS` を延ばす。

TOTP を有効にすれば手渡しは不要になる。実装するときも依存パッケージは足さず `node:crypto` で書く。

## 到達範囲を変えたいとき

publish 先は `.env` の `WEB_PUBLISH` で決まる。値を変えて `docker compose up -d web` するだけでよく、リポジトリのファイルは触らない。

```dotenv
WEB_PUBLISH=8765:8765            # LAN へ公開 (省略時の既定)
WEB_PUBLISH=127.0.0.1:8765:8765  # ホスト内だけ (外からは Tailscale 経由のみ)
```

## 再ビルドが要る変更・要らない変更

| 変更するもの                                                      | 要るもの                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_*` (`NEXT_PUBLIC_BASE_PATH`、シミュレーターの初期値) | 再ビルド。Next.js がクライアント側コードへ値を埋め込むため避けられない |
| `DASHBOARD_URL`                                                   | `docker compose up -d web` のみ (実測で確認)                           |
| `AUTH_MODE`、`REFRESH_TOKEN`、crawler の各変数                    | コンテナの再作成のみ                                                   |
| `WEB_PUBLISH`                                                     | コンテナの再作成のみ                                                   |

## 起動

`cloudflared` を除く 3 サービスだけを起動する。

```sh
docker compose build
docker compose up -d migrate web crawler
docker compose ps --all
```

`migrate` が `Exited (0)`、`web` と `crawler` が `Up` になっていれば起動できている。

Tailscale で公開する場合:

```sh
sudo tailscale serve --bg 8765
tailscale serve status
```

## 確認

- ホスト上で `curl -sI http://127.0.0.1:8765/` が 200 を返す
- 同一 LAN の別端末から `http://<ホストの LAN アドレス>:8765/` が開く
- tailnet 上の別端末から公開 URL が開く

## 上流の取り込み

```sh
git fetch upstream
git merge upstream/main
```

衝突しうるのは上記 2 ファイルの分岐部分だけである。どちらの分岐も既定値が上流の挙動と一致するように書いてあるため、そのまま上流への提案にもできる。
