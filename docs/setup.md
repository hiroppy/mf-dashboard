# セットアップ

このガイドでは、ローカルPC上のDocker ComposeでWebダッシュボード、crawler、Cloudflare Tunnelを常時稼働させる。完了すると、許可されたGoogleアカウントでダッシュボードへアクセスでき、毎日6:30と15:30（JST）の自動更新と画面上からの手動更新を利用できる。

セットアップは次の順番で進める。

1. Money Forward MEと1Passwordを準備する
2. Cloudflare Zero TrustとGoogle OAuthを準備する
3. アプリとインフラの設定ファイルを作成する
4. Terraformを適用する
5. Docker Composeを起動して動作を確認する

## 必須要件

- [Money Forward ME](https://moneyforward.com/)
- [1Password](https://1password.com/jp)（Service Account）
- [Cloudflare](https://www.cloudflare.com/ja-jp/)アカウント（Zero Trustを有効化済み）
- 公開先FQDNのゾーンをCloudflareで管理していること
- ローカルPCが常時起動できる環境
- ローカルにインストール済みのツール:
  - **Docker Desktop**（System SettingsのLogin Itemsでログイン時起動を有効化）
  - `git`
  - `terraform`（1.6以上）
  - `openssl`

リポジトリを取得し、以降のコマンドを実行するディレクトリへ移動する。

```sh
git clone https://github.com/hiroppy/mf-dashboard.git
cd mf-dashboard
```

## 1. Money Forward MEと1Passwordの準備

- Money Forward MEでワンタイムパスワードを設定する（[設定方法](https://support.me.moneyforward.com/hc/ja/articles/7359917171481-%E4%BA%8C%E6%AE%B5%E9%9A%8E%E8%AA%8D%E8%A8%BC%E3%81%AE%E8%A8%AD%E5%AE%9A%E6%96%B9%E6%B3%95)）
- 1PasswordでService Accountを発行する（[設定方法](https://developer.1password.com/docs/service-accounts/get-started#create-a-service-account)）
  - Private、Personal、Familyなど、最初から用意されている保管庫へService Accountはアクセスできない。Money Forward MEのアカウントを自分で作成した保管庫へ移し、Service Accountへアクセス権を付与する。

## 2. Cloudflare Zero Trustの準備

### 2.1 Zero Trustの有効化とTeam domainの確認

CloudflareダッシュボードからZero Trustを有効化し、Team domain（`<team-name>.cloudflareaccess.com`）を控えておく。

### 2.2 Google OAuth clientの準備

Googleログイン用のWeb Application clientを作成する。

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作り、OAuth client IDを発行
   - APIs & Services > Credentials > Create Credentials
   - アプリケーションタイプ: `Web application`
   - 承認済みの JavaScript 生成元: `https://<your-team-name>.cloudflareaccess.com`
   - 承認済みのリダイレクト URI: `https://<your-team-name>.cloudflareaccess.com/cdn-cgi/access/callback`
2. `Client ID`と`Client Secret`を控える
3. `terraform/terraform.tfvars`の`google_oauth_client_id`と`google_oauth_client_secret`に設定する

TerraformがGoogle IdPをCloudflare Zero Trustへ登録し、Access ApplicationではこのIdPだけを許可する。

### 2.3 Cloudflare API Tokenの発行

Terraform用のAPI Tokenを発行する。必要な最小権限は次のとおり。

| スコープ | 権限                                                         |
| -------- | ------------------------------------------------------------ |
| Account  | `Cloudflare Tunnel:Edit`                                     |
| Account  | `Access: Apps and Policies:Edit`                             |
| Account  | `Access: Organizations, Identity Providers, and Groups:Edit` |
| Zone     | `Zone:Read`                                                  |
| Zone     | `DNS:Edit`（対象ゾーンを含む）                               |

発行したトークンをパスワードマネージャーなどへ保管し、実値をGit管理対象外の`terraform/terraform.tfvars`にある`cloudflare_api_token`へ設定する。Terraformは`.env`や1Passwordからインフラ設定を読み取らない。

`terraform.tfvars`とTerraform stateには秘密情報が含まれる。どちらもGitへ追加せず、ローカルディスクの暗号化とファイル権限`600`を維持する。

### 2.4 公開設定と既存リソースの確認

以下を決めておく。

- Cloudflareのゾーン（例: `example.com`）
- 公開するホスト名（例: `dashboard.example.com`）
- Cloudflare Accessで許可するメールアドレス

`terraform apply`の前に、Cloudflare上に同じホスト名のDNSレコードや、同名のTunnel、Access Application、Google IdPがないことを確認する。既存リソースを継続利用する場合は、重複作成せずTerraformへインポートする。

## 3. セットアップ

### 3.1 アプリ設定

`.env`を作成し、Money Forward MEと1Passwordの必須値を設定する。

```sh
cp .env.example .env
openssl rand -hex 32
```

`openssl`の出力を`.env`の`REFRESH_TOKEN`に設定する。このトークンはcrawlerとwebが共有するアプリ用の認証情報であり、Terraformでは管理しない。Terraform適用後、`terraform -chdir=terraform output -raw access_application_aud`の出力を`CLOUDFLARE_ACCESS_AUD`へ、Zero TrustのTeam domainを`CLOUDFLARE_ACCESS_TEAM_DOMAIN`へ設定する。

| `.env`のキー                                 | 必須 | 内容                                                                     |
| -------------------------------------------- | ---- | ------------------------------------------------------------------------ |
| `REFRESH_TOKEN`                              | 必須 | crawlerとwebが共有する内部API用Bearerトークン                            |
| `CLOUDFLARE_ACCESS_TEAM_DOMAIN`              | 必須 | Access JWTの発行者となる`<team-name>.cloudflareaccess.com`               |
| `CLOUDFLARE_ACCESS_AUD`                      | 必須 | Terraformが作成したAccess ApplicationのAUD                               |
| `DASHBOARD_URL`                              | 必須 | Open Graph / Twitter metadataと通知に使う公開ダッシュボードURL           |
| `OP_SERVICE_ACCOUNT_TOKEN`                   | 必須 | 1Password Service Accountのトークン                                      |
| `OP_VAULT` / `OP_ITEM` / `OP_TOTP_FIELD`     | 必須 | Money Forward MEの保管先。日本語を含む場合はUUIDを指定                   |
| `AI_PROVIDER` / `AI_MODEL` / `AI_API_KEY`    | 任意 | 家計AIチャットとLLMカテゴリ推論。利用する機能では3項目すべて必須         |
| `SLACK_BOT_TOKEN` / `SLACK_CHANNEL_ID`       | 任意 | Slack通知                                                                |
| `DISCORD_WEBHOOK_URL` / `DISCORD_AVATAR_URL` | 任意 | Discord通知                                                              |
| `HOST_UID` / `HOST_GID`                      | 任意 | Linuxで`./data`へ書き込むユーザーのUIDとGID。既定値は`1000:1000`         |
| `AUTH_STATE_PATH`                            | 任意 | ローカル実行時のブラウザーセッション保存先。Docker Composeでは設定しない |

Linuxで`./data`へ書き込めない場合は、`id -u`と`id -g`で値を確認し、`.env`の`HOST_UID`と`HOST_GID`へ設定する。

#### 1PasswordのIDを確認する

1Password SDKは日本語の保管庫名や項目名を扱えないため、日本語を含む場合はUUIDを使う。

- `OP_VAULT`: サイドバーで保管庫を右クリックし、「UUIDをコピー」を選ぶ
- `OP_ITEM`: アイテム画面右上のメニューから「UUIDをコピー」を選ぶ
- `OP_TOTP_FIELD`: 同じメニューの「アイテムのJSONをコピー」を選び、`u`の値が`TOTP_`で始まるフィールドIDを取り出す

### 3.2 インフラ設定

Cloudflare API TokenとGoogle OAuth clientを用意したら、Git管理対象外のインフラ設定ファイルを作成する。

```sh
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
chmod 600 terraform/terraform.tfvars
```

`terraform/terraform.tfvars`に実値を設定する。

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

`terraform/terraform.tfvars`、Terraform state、`secrets/cloudflared-token`はGit管理対象外。秘密情報を含むため、内容を表示したりコミットしたりしない。

### 3.3 Terraform planの確認

まずは適用せず、変更内容だけを確認する。

```sh
terraform -chdir=terraform init
terraform -chdir=terraform plan
```

planでは以下を確認する。

- 意図しない変更や削除がない
- 対象のゾーンとホスト名が正しい
- Google IdP、Tunnel、Tunnel設定、DNS、Access Application、メールアドレスの許可ポリシーが作成対象になっている
- `local_sensitive_file`が`secrets/cloudflared-token`を作成する

既存リソースとの競合や意図しない変更がある場合は適用せず、設定またはインポート方針を見直す。

### 3.4 インフラの適用

planに問題がなければ適用する。

```sh
terraform -chdir=terraform apply
```

適用後にTerraformの出力とTunnelトークンファイルを確認する。

```sh
terraform -chdir=terraform output
ls -l secrets/cloudflared-token
```

`tunnel_id`、`hostname`、`google_identity_provider_id`が出力され、`secrets/cloudflared-token`の権限が`-r--r--r--`（mode `444`）なら成功。

### 3.5 Docker Composeの起動

```sh
docker compose build
docker compose up -d
```

Terraformの適用が成功し、`secrets/cloudflared-token`が作成されたことを確認してからDocker Composeを起動する。

以降はcrawlerコンテナ内のsupercronicが`crontab`のスケジュールで自動更新する。

各コンテナの役割は次のとおり。

- **web**: ダッシュボードを配信し、共有データベースを読み取る
- **cloudflared**: Cloudflare Tunnelへ接続する
- **crawler**: 定期更新と手動更新を受け付け、取得したデータを共有データベースへ保存する

スケジュールを変更する場合は`docker/crawler/crontab`を編集し、`docker compose build crawler`でcrawlerを再ビルドする。

### 3.6 TunnelとAccessの動作確認

```sh
docker compose ps
docker compose logs -f
```

以下を確認する:

- `docker compose ps`で3サービスすべてが`Up`になっている
- ログに認証エラーやTunnel接続エラーがない
- 未ログインで`https://<hostname>/`へアクセスするとGoogleログインへ移動する
- 許可したアカウントではダッシュボードが表示される
- 許可していないアカウントではアクセスが拒否される
- Google以外のログイン方法が表示されない

```sh
# Cloudflare Access経由の応答を確認
curl -I https://<hostname>/
# → 302 + Location が <team-name>.cloudflareaccess.com 配下なら Access 動作中

# Terraform管理中のTunnel IDを確認
terraform -chdir=terraform output -raw tunnel_id
```

## 4. 運用

- **ホストを再起動する**: Docker Desktopの自動起動後、`restart: unless-stopped`を設定した各コンテナも自動復帰する
- **イメージを再ビルドする**: `docker compose build && docker compose up -d`
- **crawlerをすぐに実行する**: `docker compose exec crawler pnpm --filter @mf-dashboard/crawler start`
- **webの表示だけを更新する**: `docker compose exec crawler sh -c 'curl -fsS -X POST -H "Authorization: Bearer ${REFRESH_TOKEN}" http://web:8765/api/refresh/'`

## 5. オプション設定

ここからの設定は、基本セットアップの完了後に必要なものだけ追加する。

### Slack通知

1. [Slack API](https://api.slack.com/apps)でBotを作成し、`xoxb-`から始まるトークンを発行する
2. Botへ`chat:write`権限を付与し、投稿先チャンネルへ招待する
3. `.env`の`SLACK_BOT_TOKEN`と`SLACK_CHANNEL_ID`を設定する

### Discord通知

1. 通知先チャンネルの「連携サービス」からIncoming Webhookを作成する
2. `.env`の`DISCORD_WEBHOOK_URL`へ、発行された`https://discord.com/api/webhooks/...`形式のURLを設定する

### 家計AIチャット

家計AIチャットを利用する場合は、`.env`に次の3項目を設定する。いずれかが空の場合、チャットUIは表示されず、家計データや外部AI APIへ接続しない。

```dotenv
AI_PROVIDER=openai
AI_MODEL=<provider-model-id>
AI_API_KEY=<provider-api-key>
```

- `AI_PROVIDER`: `openai`、`anthropic`、`google`のいずれか
- `AI_MODEL`: 選択したプロバイダーで利用可能なモデルID
- `AI_API_KEY`: 選択したプロバイダーのAPIキー。ブラウザーへは公開せず、`.env`だけに保存する

ローカルでデモデータを使って確認する場合は、リポジトリルートで次を実行する。

```sh
pnpm install
pnpm --filter @mf-dashboard/db build:demo
DB_PATH=../../data/demo.db pnpm --filter @mf-dashboard/web dev
```

`pnpm build:demo`で生成する静的な公開デモにはAPI routeが含まれないため、家計AIチャットの確認には使用しない。

Docker Composeで設定を反映する場合は、webイメージを再ビルドして起動する。

```sh
docker compose build web
docker compose up -d web
```

起動後、ダッシュボード右下の「家計AIチャットを開く」ボタンを選び、質問を入力して送信する。チャットは現在のDrizzleスキーマから利用可能なテーブルとカラムを取得し、選択中のグループへread-only SQLを実行する。回答は本文として表示され、ユーザーが画面表示や遷移先を明示的に求めた場合だけ、検証済みのダッシュボード内部リンクを含む。該当データがない場合は、条件を勝手に変更したり金額を推測したりしない。

チャットの質問と、回答に必要な家計データは設定したAIプロバイダーへ送信される。会話はブラウザーのストレージへ保存されないが、AIプロバイダー側のデータ取扱方針を確認し、送信を許可できる場合だけ有効にする。本番環境では、Cloudflare Accessで認証された利用者だけがダッシュボードへアクセスできる構成を維持する。

回答生成に失敗した場合はチャット内にエラーが表示される。まず3つのAI環境変数、APIキーの権限・利用上限、モデルIDを確認する。家計データが未取得の場合はcrawlerを実行してから再度質問する。

従来のMCPサーバーとAIクライアント側のMCPセットアップは廃止済み。家計データの照会にはWebアプリ内の家計AIチャットを使用する。

### 未分類取引のカテゴリ決定

`data/category-rules.json`を作成すると、crawlerはデータベースへ保存する前に、新規の未分類取引へカテゴリを設定する。ファイルが存在しない場合、この機能は無効になり、取引を未分類のまま保存する。

```sh
cp data/category-rules.example.json data/category-rules.json
```

設定例:

```json
{
  "llm": {
    "enabled": false,
    "maxPerRun": 5,
    "minConfidence": 0.65
  },
  "rules": [
    {
      "accountName": "テスト口座",
      "category": "食費",
      "subCategory": "食料品"
    },
    {
      "descriptionContains": "動画サービス",
      "category": "趣味・娯楽",
      "subCategory": "動画・音楽"
    }
  ]
}
```

#### 固定ルール

- 対象は「新規」「未分類」「非振替」「計算対象」の取引のみ
- `accountName`は取引の口座名と完全一致する
- `descriptionContains`は取引内容と部分一致する
- 両方を指定した場合は、両条件に一致する取引だけを対象にする
- 固定ルールに一致した場合はそのカテゴリを優先し、LLMを呼び出さない
- `category`または`subCategory`がMoney Forward MEの候補に存在しない場合、そのルールを採用しない

#### LLMによる推論

固定ルールに一致しなかった取引だけをLLMで推論する場合は、`llm.enabled`を`true`へ変更し、`.env`に`AI_PROVIDER`、`AI_MODEL`、`AI_API_KEY`を設定する。

- Money Forward MEから取得した候補カテゴリの中から選択し、カテゴリIDは生成しない
- 1回の実行件数は`llm.maxPerRun`で制限する。既定値は`5`
- 推論結果の確信度が`llm.minConfidence`未満の場合は反映しない。既定値は`0.65`
- 取引の日付、種別、金額、内容、候補カテゴリのIDと名称を外部プロバイダーへ送信する
- 更新に失敗してもcrawlerは停止せず、対象取引を未分類のまま保存する

採用したカテゴリはMoney Forward MEの`/cf/update`へ反映する。その後、対象月を再取得してデータベースへ保存する。外部プロバイダーへ取引情報を送信してよい場合だけ、LLMによる推論を有効にする。
