# セットアップ

ローカル PC で **Docker Compose** を使い、Next.js (web) / cloudflared / crawler の 3 サービスを常駐させる構成のセットアップ手順。crawler は **コンテナ内 cron** (supercronic) で JST 7:00 / 15:30 に走り、完了後 web の `/api/refresh/` を Bearer 認証付きで叩いて `revalidatePath` で全ルートを再生成する。

## 必須要件

- [MoneyForward Me](https://moneyforward.com/)
- [1Password](https://1password.com/jp) (Service Account)
- [Cloudflare](https://www.cloudflare.com/ja-jp/) アカウント (Zero Trust 有効化済み)
- 公開先 FQDN の zone が Cloudflare で管理されている
- ローカル PC が常時起動できる環境
- ローカルにインストール済みのツール:
  - **Docker Desktop** (System Settings の Login Items でログイン時起動を有効化)
  - Node.js / `pnpm` (`corepack enable pnpm`)
  - `terraform` (>= 1.6)
  - `op` CLI (1Password)

## 1. MoneyForward / 1Password の準備

- MoneyForward でワンタイムパスワードの設定を行う ([参考](https://support.me.moneyforward.com/hc/ja/articles/7359917171481-%E4%BA%8C%E6%AE%B5%E9%9A%8E%E8%AA%8D%E8%A8%BC%E3%81%AE%E8%A8%AD%E5%AE%9A%E6%96%B9%E6%B3%95))
- 1Password で service account を発行する ([参考](https://developer.1password.com/docs/service-accounts/get-started#create-a-service-account))
  - Private、Personal、Family など最初から作成されている vault に MoneyForward のアカウントや Cloudflare API Token を保存している場合、service account はその vault へアクセスできない。手で作った vault へ移動させ、service account にアクセス権を付与する必要がある
- (Optional) Slack Bot を作成する (更新結果を Slack に通知したい場合)
  - [ここ](https://api.slack.com/apps) から作成し、`xoxb-` から始まる token を作成
  - `chat:write` の権限を与え、投稿先チャンネルに招待する
- (Optional) Discord Incoming Webhook を作成する (更新結果を Discord に通知したい場合)
  - 通知先チャンネルの「連携サービス」から Incoming Webhook を作成し、`https://discord.com/api/webhooks/...` 形式の URL を控える

## 2. Cloudflare Zero Trust の準備

### 2.1 Zero Trust の有効化と Team domain の確認

Cloudflare ダッシュボードから Zero Trust を有効化し、Team domain (`<team-name>.cloudflareaccess.com`) を控えておく。

### 2.2 Google OAuth client の準備

Google ログイン用の Web Application client を作成する:

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作り、OAuth client ID を発行
   - APIs & Services > Credentials > Create Credentials
   - アプリケーションタイプ: `Web application`
   - 承認済みの JavaScript 生成元: `https://<your-team-name>.cloudflareaccess.com`
   - 承認済みのリダイレクト URI: `https://<your-team-name>.cloudflareaccess.com/cdn-cgi/access/callback`
2. `Client ID` と `Client Secret` を控える
3. `terraform/terraform.tfvars` の `google_oauth_client_id` / `google_oauth_client_secret` に設定する

Terraform が Google IdP を Cloudflare Zero Trust へ登録し、Access Application ではこの IdP だけを許可する。

### 2.3 Cloudflare API Token の発行

Terraform 用の API Token を発行する。最小権限:

| スコープ | 権限                                                         |
| -------- | ------------------------------------------------------------ |
| Account  | `Cloudflare Tunnel:Edit`                                     |
| Account  | `Access: Apps and Policies:Edit`                             |
| Account  | `Access: Organizations, Identity Providers, and Groups:Edit` |
| Zone     | `Zone:Read`                                                  |
| Zone     | `DNS:Edit` (対象 zone を含む)                                |

発行した token はパスワードマネージャーなどへ保管したうえで、実値を gitignore 済みの `terraform/terraform.tfvars` の `cloudflare_api_token` に設定する。Terraform は `.env` や 1Password からインフラ設定を読み取らない。

`terraform.tfvars` と Terraform state には秘密情報が含まれる。どちらも Git へ追加せず、ローカルディスクの暗号化とファイル権限 `600` を維持する。

### 2.4 公開設定と既存リソースの確認

以下を決めておく:

- Cloudflare zone (例: `example.com`)
- 公開する hostname (例: `dashboard.example.com`)
- Cloudflare Access で許可するメールアドレス

apply 前に、Cloudflare 上に同じ hostname の DNS record や、同名の Tunnel / Access Application / Google IdP がないことを確認する。既存リソースを継続利用する場合は、重複作成せず Terraform へ import する。

## 3. セットアップ

### 3.1 アプリ設定

`.env` を作成し、MoneyForward / 1Password の必須値を設定する:

```sh
cp .env.example .env
openssl rand -hex 32
```

`openssl` の出力を `.env` の `REFRESH_TOKEN` に設定する。この token は crawler と web が共有するアプリ用の認証情報であり、Terraform では管理しない。

既存の GitHub Actions secrets に入れていた MoneyForward / 通知系の値は、そのまま `.env` に移して使える。Slack / Discord / dashboard link は必要な場合だけ設定する。local の `pnpm db:dev` / `pnpm dev` では `DB_PATH` と `WEB_URL` を未設定のままにし、repo root の `data/moneyforward.db` と refresh skip の既定挙動を使う。

| `.env` Key                                   | 必須     | 値                                                                                                    |
| -------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `REFRESH_TOKEN`                              | ✅       | crawler と web が共有する `/api/refresh/` 用 Bearer token                                             |
| `OP_SERVICE_ACCOUNT_TOKEN`                   | ✅       | 1Password Service Account token                                                                       |
| `OP_VAULT` / `OP_ITEM` / `OP_TOTP_FIELD`     | ✅       | MoneyForward の保管先 (UUID 推奨。「1Password の ID の見つけ方」参照)                                 |
| `SLACK_BOT_TOKEN` / `SLACK_CHANNEL_ID`       | optional | Slack 通知                                                                                            |
| `DISCORD_WEBHOOK_URL` / `DISCORD_AVATAR_URL` | optional | Discord 通知                                                                                          |
| `DASHBOARD_URL`                              | optional | 公開している `https://<hostname>/`                                                                    |
| `AUTH_STATE_PATH`                            | optional | local 実行時の browser session 保存先。Docker Compose では crawler 専用 volume を使うため通常は未設定 |

#### 1Password の ID の見つけ方

1password/sdk は日本語に対応しておらずエラーになるため日本語のものは UUID を使う:

- `OP_VAULT`: サイドバーで保管庫を右クリック > UUID をコピー
- `OP_ITEM`: アイテム画面右上のケバブメニューから UUID をコピー
- `OP_TOTP_FIELD`: 同メニューの「アイテムの JSON をコピー」から、`u` に `TOTP_` 開始の文字列があるフィールド ID を抽出

### 3.2 インフラ設定

Cloudflare API Token と Google OAuth client を用意したら、gitignore 済みのインフラ設定ファイルを作成する:

```sh
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
chmod 600 terraform/terraform.tfvars
```

`terraform/terraform.tfvars` に実値を設定する:

```hcl
cloudflare_api_token       = "..."
google_oauth_client_id     = "..."
google_oauth_client_secret = "..."

zone_name = "example.com"
hostname  = "dashboard.example.com"

allowed_emails = [
  "user-a@example.com",
]
```

`terraform/terraform.tfvars`、Terraform state、`secrets/cloudflared-token` は Git 管理対象外。秘密情報を含むため、内容を表示したり commit したりしない。

### 3.3 Terraform plan の確認

まず apply せず、変更内容だけを確認する:

```sh
terraform -chdir=terraform init
terraform -chdir=terraform plan
```

plan では以下を確認する:

- 意図しない変更や destroy がない
- 対象の zone と hostname が正しい
- Google IdP、Tunnel、Tunnel config、DNS、Access Application と email allowlist policy が作成対象になっている
- `local_sensitive_file` が `secrets/cloudflared-token` を作成する

既存リソースとの競合や意図しない変更がある場合は、apply せず設定または import 方針を見直す。

### 3.4 インフラの適用

plan に問題がなければ適用する:

```sh
terraform -chdir=terraform apply
```

適用後に Terraform output と Tunnel token file を確認する:

```sh
terraform -chdir=terraform output
ls -l secrets/cloudflared-token
```

`tunnel_id`、`hostname`、`google_identity_provider_id` が出力され、`secrets/cloudflared-token` の権限が `-r--r--r--` (mode `444`) なら成功。この file は cloudflared container の non-root UID から読めるようにしつつ、web/crawler が mount する DB 用の `./data` とは分離する。

### 3.5 Docker Compose の起動

```sh
docker compose build
docker compose up -d
```

Terraform apply が成功し、`secrets/cloudflared-token` が作成されてから Docker Compose を起動する。

以降は crawler コンテナ内の supercronic が `crontab` のスケジュールで自動更新する。

各コンテナの役割:

- **web** — Next.js を `next start --port 8765` で常駐。Docker image build 時は dashboard route を request-time rendering にし、起動後は volume 経由の本番 DB を読む
- **cloudflared** — Compose secretとしてmountされた `secrets/cloudflared-token` でCloudflare Edgeに接続
- **crawler** — Docker image の非rootユーザーで動作し、supercronic で `crontab` (`docker/crawler/crontab`) を回して、JST 7:00 / 15:30 に `pnpm --filter @mf-dashboard/crawler start` を起動。MoneyForward の browser session は crawler 専用 volume (`/app/crawler-state/auth-state.json`) に保存し、web から mount しない。crawler 自身が完了時に `WEB_URL/api/refresh/` へ `REFRESH_TOKEN` を Bearer 認証で POST して `revalidatePath` をトリガー (Docker bridge 内部のみ到達可能、外部は Cloudflare Access で保護)

スケジュールを変えたい場合は `docker/crawler/crontab` を編集して `docker compose build crawler` し直す。

### 3.6 Tunnel / Access の動作確認

```sh
docker compose ps                  # 3 サービスすべて Up
docker compose logs -f web         # next start のログ
docker compose logs -f crawler     # supercronic と crawl 実行のログ
docker compose logs -f cloudflared # tunnel 接続状態
```

以下を確認する:

- `docker compose ps` で3サービスすべてが起動している
- cloudflared のログに認証エラーや Tunnel 接続エラーがない
- 未ログインで `https://<hostname>/` にアクセスすると Google ログインへ移動する
- allowlist 内のアカウントではダッシュボードが表示される
- allowlist 外のアカウントではアクセスが拒否される
- Google 以外のログイン方法が表示されない

```sh
# Cloudflare Access 経由の応答を確認
curl -I https://<hostname>/
# → 302 + Location が <team-name>.cloudflareaccess.com 配下なら Access 動作中

# Terraform管理中のTunnel IDを確認
terraform -chdir=terraform output -raw tunnel_id
```

## 4. 運用

- ホストの再起動: Docker Desktop が自動起動 → `restart: unless-stopped` の各コンテナも自動復帰
- 手動再ビルド (依存追加など): `docker compose build && docker compose up -d`
- crawler を即時実行: `docker compose exec crawler pnpm --filter @mf-dashboard/crawler start` (完了時に自動的に web へ refresh ping を送る)
- web のキャッシュだけ手動で無効化: `docker compose exec crawler sh -c 'curl -fsS -X POST -H "Authorization: Bearer ${REFRESH_TOKEN}" http://web:8765/api/refresh/'`
