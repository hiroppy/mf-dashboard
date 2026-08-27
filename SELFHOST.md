# 個人利用向けのセルフホスト構成

このフォークは、上流の運用前提 (1Password Service Account / Cloudflare Tunnel + Access / Google OAuth) を、自分ひとりが手元で見る用途に合わせて置き換えたものである。

| 上流                          | このフォーク                                       |
| ----------------------------- | -------------------------------------------------- |
| 1Password Service Account     | `.env` に資格情報を直接置く                        |
| Cloudflare Tunnel + Terraform | プライベートネットワーク (Tailscale 等) にのみ公開 |
| Google OAuth によるログイン   | ログイン無し。到達できる範囲が閲覧できる範囲になる |

## 前提となる性質

上流のダッシュボードのページには認証チェックが無く、アプリ内で検証しているのは `hasValidCloudflareAccess` の呼び元 2 箇所 (`api/chat` と `api/crawler/refresh`) だけである。エッジの認証を外すということは、**ポートに到達できる者が全資産を無認証で閲覧できる**ということを意味する。

したがって次の 2 点を必ず守る。

- web のポートは `127.0.0.1` にのみ publish する (`compose.override.yml` がそう設定している)。`0.0.0.0` に出すと同一 LAN の全端末から見える
- 公開はプライベートネットワークに閉じる。Tailscale の場合は `tailscale serve` を使い、`tailscale funnel` は使わない (公開インターネットへ露出する)

## 上流からの差分

| パス                                    | 内容                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/crawler/src/auth/credentials.ts`  | `CREDENTIALS_SOURCE` に `env` を指定すると 1Password SDK を呼ばず環境変数から読む。既定は `1password` で上流互換 |
| `apps/web/src/lib/cloudflare-access.ts` | `AUTH_MODE=trusted-network` のとき Access JWT の検証を省く                                                       |
| `compose.override.yml`                  | web をループバックへ publish し、追加した環境変数をコンテナへ渡す                                                |

`compose.yml`・`terraform/`・`pnpm-lock.yaml` は変更しない。上流を継続的に取り込めるようにするためで、依存パッケージも追加しない。

## 環境変数

`.env.example` をコピーしたうえで、次のように設定する。

```dotenv
# 資格情報を環境変数から読む
CREDENTIALS_SOURCE=env
MF_USERNAME=<Money Forward ME のログイン ID>
MF_PASSWORD=<パスワード>

# ログインを課さない (プライベートネットワークに閉じていることが前提)
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

### 二段階認証

Money Forward ME 側で二段階認証を使っている場合、`CREDENTIALS_SOURCE=env` では OTP を供給できない (`getOTP()` が理由付きで失敗する)。その場合は TOTP の生成を実装するか、`CREDENTIALS_SOURCE` を既定の `1password` に戻す。TOTP を実装するときも依存パッケージは足さず `node:crypto` で書く。

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
- 同一 LAN の別端末から `http://<ホストの LAN アドレス>:8765/` に到達しない
- プライベートネットワーク上の別端末から公開 URL が開く

## 上流の取り込み

```sh
git fetch upstream
git merge upstream/main
```

衝突しうるのは上記 2 ファイルの分岐部分だけである。どちらの分岐も既定値が上流の挙動と一致するように書いてあるため、そのまま上流への提案にもできる。
