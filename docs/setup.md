# セットアップ

ローカル PC で **Docker Compose** を使い、Next.js (web) / cloudflared / crawler の 3 サービスを常駐させる構成のセットアップ手順。crawler は **コンテナ内 cron** (supercronic) で JST 7:00 / 15:30 に走り、完了後 web の `/api/refresh` を叩いて `revalidatePath` で全ルートを再生成する。

## 必須要件

- [MoneyForward Me](https://moneyforward.com/)
- [1Password](https://1password.com/jp) (Service Account)
- [Cloudflare](https://www.cloudflare.com/ja-jp/) アカウント (Zero Trust 有効化済み)
- 公開先 FQDN の zone が Cloudflare で管理されている
- ローカル PC が常時起動できる環境
- ローカルにインストール済みのツール:
  - **Docker Desktop** (System Settings の Login Items でログイン時起動を有効化)
  - `terraform` (>= 1.6)
  - `op` CLI (1Password)

## 1. MoneyForward / 1Password の準備

- MoneyForward でワンタイムパスワードの設定を行う ([参考](https://support.me.moneyforward.com/hc/ja/articles/7359917171481-%E4%BA%8C%E6%AE%B5%E9%9A%8E%E8%AA%8D%E8%A8%BC%E3%81%AE%E8%A8%AD%E5%AE%9A%E6%96%B9%E6%B3%95))
- 1Password で service account を発行する ([参考](https://developer.1password.com/docs/service-accounts/get-started#create-a-service-account))
  - Private、Family など最初から作成されている vault に MoneyForward のアカウントを保存している場合、service account はそのvaultへアクセスできない。手で作った vault へ移動させる必要がある
- (Optional) Slack Bot を作成する (更新結果を Slack に通知したい場合)
  - [ここ](https://api.slack.com/apps) から作成し、`xoxb-` から始まる token を作成
  - `chat:write` の権限を与え、投稿先チャンネルに招待する
- (Optional) Discord Incoming Webhook を作成する (更新結果を Discord に通知したい場合)
  - 通知先チャンネルの「連携サービス」から Incoming Webhook を作成し、`https://discord.com/api/webhooks/...` 形式の URL を控える

## 2. Cloudflare Zero Trust の準備

### 2.1 Zero Trust の有効化と Team domain の確認

Cloudflare ダッシュボードから Zero Trust を有効化し、Team domain (`<team-name>.cloudflareaccess.com`) を控えておく。

### 2.2 Google を Identity Provider として登録

Google ログインを使う場合、以下を行う:

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作り、OAuth client ID を発行
   - APIs & Services > Credentials > Create Credentials
   - アプリケーションタイプ: `Web application`
   - 承認済みの JavaScript 生成元: `https://<your-team-name>.cloudflareaccess.com`
   - 承認済みのリダイレクト URI: `https://<your-team-name>.cloudflareaccess.com/cdn-cgi/access/callback`
2. `Client ID` と `Client Secret` を控える
3. Cloudflare Zero Trust の `Settings > Authentication > Login methods` で Google を Identity Provider として登録

Terraform はアカウントに登録済みの Google IdP を自動で参照する。未登録の場合は IdP 制限なしの Access Application が作られる。

### 2.3 Cloudflare API Token の発行

Terraform 用の API Token を発行する。最小権限:

| スコープ | 権限                             |
| -------- | -------------------------------- |
| Account  | `Cloudflare Tunnel:Edit`         |
| Account  | `Access: Apps and Policies:Edit` |
| Zone     | `DNS:Edit` (対象 zone を含む)    |

発行した token を 1Password に **API Credential** タイプで保存する。デフォルトの参照先:

- 1Password vault: `Private`
- アイテムタイプ: `API Credential`
- アイテム名: `Cloudflare API Token mf-dashboard`
- フィールド: `credential`

参照は `op://Private/Cloudflare API Token mf-dashboard/credential` の形式で `terraform/.env.template` から行われる。

## 3. Terraform で Tunnel + Access を構築

```sh
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars` を実際の値に書き換える:

```hcl
account_id = "<Cloudflare Account ID>"
zone_id    = "<Cloudflare Zone ID>"
hostname   = "dashboard.example.com"
allowed_emails = [
  "you@example.com",
]
```

適用:

```sh
op run --env-file=.env.template -- terraform init
op run --env-file=.env.template -- terraform plan
op run --env-file=.env.template -- terraform apply
```

## 4. `.env` の作成

リポジトリルートの `.env.example` をコピーして `.env` を作る (`.gitignore` 済み):

```sh
cp .env.example .env
```

| Key                                                  | 必須     | 値                                                                                             |
| ---------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `TUNNEL_TOKEN`                                       | ✅       | `cd terraform && op run --env-file=.env.template -- terraform output -raw tunnel_token` の結果 |
| `OP_SERVICE_ACCOUNT_TOKEN`                           | ✅       | 1Password Service Account token                                                                |
| `OP_VAULT` / `OP_ITEM` / `OP_TOTP_FIELD`             | ✅       | MoneyForward の保管先 (UUID 推奨。「1Password の ID の見つけ方」参照)                          |
| `SLACK_BOT_TOKEN` / `SLACK_CHANNEL_ID`               | optional | Slack 通知                                                                                     |
| `DISCORD_WEBHOOK_URL` / `DISCORD_AVATAR_URL`         | optional | Discord 通知                                                                                   |
| `DASHBOARD_URL`                                      | optional | 公開している `https://<hostname>/`                                                             |
| `NEXT_PUBLIC_GITHUB_ORG` / `NEXT_PUBLIC_GITHUB_REPO` | optional | UI から workflow へのリンク                                                                    |

### 1Password の ID の見つけ方 (アプリ)

1password/sdk は日本語に対応しておらずエラーになるため日本語のものは UUID を使う:

- `OP_VAULT`: サイドバーで保管庫を右クリック > UUID をコピー
- `OP_ITEM`: アイテム画面右上のケバブメニューから UUID をコピー
- `OP_TOTP_FIELD`: 同メニューの「アイテムの JSON をコピー」から、`u` に `TOTP_` 開始の文字列があるフィールド ID を抽出

## 5. Docker Compose で起動

```sh
docker compose build
docker compose up -d
```

各コンテナの役割:

- **web** — Next.js を `next start --port 8765` で常駐 (image build 時に `data/demo.db` で bootstrap 済み、本番 DB は volume 経由で読む)
- **cloudflared** — `TUNNEL_TOKEN` で Cloudflare Edge に接続
- **crawler** — supercronic で `crontab` (`docker/crawler/crontab`) を回し、JST 7:00 / 15:30 に MoneyForward をスクレイピング → 終了後 `http://web:8765/api/refresh` を POST して `revalidatePath` をトリガー (Docker bridge 内部のみ到達可能、外側は Cloudflare Access で gate 済みのため認証なし)
  - 起動時に `data/moneyforward.db` が存在しなければ初回 crawl を実行する

スケジュールを変えたい場合は `docker/crawler/crontab` を編集して `docker compose build crawler` し直す。

### 動作確認

```sh
docker compose ps                  # 3 サービスすべて Up
docker compose logs -f web         # next start のログ
docker compose logs -f crawler     # supercronic と crawl 実行のログ
docker compose logs -f cloudflared # tunnel 接続状態
```

ブラウザで `https://<hostname>/` にアクセスし、Google ログインを通過するとダッシュボードが表示されれば成功。許可リスト外アカウントで 403 になることも確認。

```sh
# Cloudflare Access 経由の応答を確認
curl -I https://<hostname>/
# → 302 + Location が <team-name>.cloudflareaccess.com 配下なら Access 動作中

# 接続中の Tunnel を確認
op run --env-file=terraform/.env.template -- \
  terraform -chdir=terraform output -raw tunnel_id \
  | xargs -I {} cloudflared tunnel info {}
```

## 6. 運用

- ホストの再起動: Docker Desktop が自動起動 → `restart: unless-stopped` の各コンテナも自動復帰
- 手動再ビルド (依存追加など): `docker compose build && docker compose up -d`
- crawler を即時実行: `docker compose exec crawler /app/docker/crawler/run-crawl.sh`
- web のキャッシュを手動で無効化: `docker compose exec crawler curl -fsS -X POST http://web:8765/api/refresh`

## 更新

```sh
sh update.sh
```
