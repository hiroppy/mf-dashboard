# セットアップ

## 必須要件

- [MoneyForward Me](https://moneyforward.com/)
- [1Password](https://1password.com/jp)
- [Cloudflare](https://www.cloudflare.com/ja-jp/)
  - GitHub Pagesが使えるならなくてもいいが、workflowを変更する必要あり

## 1. プライベートリポジトリの作成

**SQLiteをプッシュするため、プライベートリポジトリで行ってください。** GitHubの仕様上、このリポジトリをforkした場合は強制的にパブリックになるため、UIから行わずに以下を手元で実行し作成してください。

```sh
$ git clone --bare https://github.com/hiroppy/mf-dashboard
$ cd mf-dashboard
# 作成したプライベートリポジトリへ変更
$ git push --mirror https://github.com/xxxx/private-repo.git
$ git remote add upstream https://github.com/hiroppy/mf-dashboard
```

## 2. 各種アカウント設定

- MoneyForwardでワンタイムパスワードの設定を行う ([参考](https://support.me.moneyforward.com/hc/ja/articles/7359917171481-%E4%BA%8C%E6%AE%B5%E9%9A%8E%E8%AA%8D%E8%A8%BC%E3%81%AE%E8%A8%AD%E5%AE%9A%E6%96%B9%E6%B3%95))
- 1Passwordでservice accountを発行する ([参考](https://developer.1password.com/docs/service-accounts/get-started#create-a-service-account))
  - Private, Familyなど最初から作成されているvaultにMoneyForwardのアカウントを保存している場合、service accountはそのvaultへアクセスできないので注意。その場合は、手で作ったvaultへ移動させる必要がある
- Cloudflareにプロジェクトを作り、そのリポジトリとGitHub連携を行う ([参考](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/))
  - ビルド構成
    - ビルド コマンド: `pnpm build --filter="@mf-dashboard/web"`
    - デプロイ コマンド: `npx wrangler deploy`
    - バージョン コマンド: `npx wrangler versions upload`
    - ルート ディレクトリ: `/`
- (Optional) Slack Botを作成する (更新結果をSlackに通知したい場合)
  - [ここ](https://api.slack.com/apps)から作成し、`xoxb-`から始まるtokenを作成
    - Install App > OAuth Tokens
  - `chat:write` の権限を与えておく
    - OAuth & Permissions > Scopes
  - 投稿したいチャンネルに招待する
- (Optional) Discord Incoming Webhook を作成する (更新結果をDiscordに通知したい場合)
  - 通知先チャンネルの「連携サービス」から Incoming Webhook を作成
  - `https://discord.com/api/webhooks/...` 形式の URL を控える

## 3. Cloudflare Oneを設定

Cloudflareへデプロイするにあたり、[Cloudflare One](https://developers.cloudflare.com/cloudflare-one/)でアクセスコントロールを設定する必要がある。

Workers&Pagesで先程作ったプロジェクトの「設定」タブの「ドメインとルート」項目にあるworkers.devタイプのURL行の3点メニューを開き、Cloudflare Accessを有効にする。そうするとアプリケーションが作られているので、ポリシーとログイン方法を設定する必要がある。ここのポリシーで許可したいEmailを追加する。

注意: プロジェクトのプレビュー URL がactive(default)の場合、外から見えてしまうため無効にするのを忘れないこと。

標準でワンタイムパスワード込みのログインは行えるが、Google認証を使いたい場合は次のセクションへ移動。

### Google認証を利用したい場合

- [Google Cloud](https://console.cloud.google.com/)でプロジェクトを作り、OAuth client IDを発行
  - APIs & Services > Credentials > Create Credentials
  - `https://console.cloud.google.com/apis/credentials`
- 以下を設定
  - アプリケーションタイプ
    - `Web application`
  - 承認済みの JavaScript 生成元
    - https://<your-team-name>.cloudflareaccess.com
    - `<your-team-name>`はCloudflare Oneのチーム名
  - 承認済みのリダイレクト URI
    - `https://<your-team-name>.cloudflareaccess.com/cdn-cgi/access/callback`
- `Client ID` と `Client Secret`を覚えておく

Cloudflare OneにIdentity Providerの登録(`/integrations/identity-providers`)があるので、そこへ行き、Google認証を登録する。最後にさっき作ったアプリケーションの設定に行き、ログイン方法の選択でGoogleが選べるようになるので選べば完了。

## 3. 環境変数設定

作成したリポジトリの `/settings/secrets/actions` ページへ行き、以下の環境変数をそれぞれ設定。変数とシークレットそれぞれあるので間違えないように。

### Variables

| Key              | Required | Value | Why                                                               |
| ---------------- | -------- | ----- | ----------------------------------------------------------------- |
| RUN_TASK         | ✅       | true  | crontabの実行に必要                                               |
| CACHE_AUTH_STATE |          | true  | 認証状態をキャッシュし毎回のログインをスキップ (default: false)   |
| CLEANUP_GROUPS   |          | true  | MoneyForwardから削除されたグループをDBからも削除 (default: false) |

### Secrets

| Key                      | Required | Value                                            | Why                                                 |
| ------------------------ | -------- | ------------------------------------------------ | --------------------------------------------------- |
| OP_SERVICE_ACCOUNT_TOKEN | ✅       | 1passwordのサービスアカウントトークン            | ログインに必要                                      |
| OP_VAULT                 | ✅       | 保管庫ID                                         | ログインに必要                                      |
| OP_ITEM                  | ✅       | MoneyForwardのアイテムID                         | ログインに必要                                      |
| OP_TOTP_FIELD            | ✅       | MoneyForwardのワンタイムパスワードのフィールドID | ログインに必要                                      |
| DASHBOARD_URL            |          | デプロイ先URL                                    | Slack投稿でダッシュボードリンクを生成               |
| SLACK_BOT_TOKEN          |          | bot token                                        | Slackへ結果投稿のため                               |
| SLACK_CHANNEL_ID         |          | 投稿先のチャンネルID                             | Slackへ結果投稿のため                               |
| DISCORD_WEBHOOK_URL      |          | Discord Incoming Webhook URL                     | crawler/e2e結果をDiscordへ通知するため              |
| DISCORD_AVATAR_URL       |          | Discord通知のアイコン画像URL                     | Discord通知の `avatar_url` を上書きするため         |
| NEXT_PUBLIC_GITHUB_ORG   |          | このリポジトリの組織名                           | UIからGitHub workflowへアクセスするためのリンク作成 |
| NEXT_PUBLIC_GITHUB_REPO  |          | このリポジトリのリポジトリ名                     | UIからGitHub workflowへアクセスするためのリンク作成 |

`NEXT_PUBLIC_GITHUB_ORG`, `NEXT_PUBLIC_GITHUB_REPO`に関しては、Next.jsのビルド時に必要な環境変数なので、Cloudflare側で設定する必要がある。

### 1PasswordのIDの見つけ方 (アプリ)

1password/sdkは日本語に対応しておらずエラーとなってしまうため日本語のものは全部UUIDを利用する必要がある。

- `OP_VAULT`
  - サイドバーでその保管庫を右クリックすると、UUIDをコピーが出てくる
- `OP_ITEM`
  - MoneyForwardのアイテム画面右上にあるケバブメニュー(`︙`)をクリックすると、UUIDをコピーが出てくる
- `OP_TOTP_FIELD`
  - `OP_ITEM`同様、メニューを開きアイテムのJSONをコピーを押し、そのJSONの中からUUIDを探す。`u`に`TOTP_`開始の文字列があったらそれが正解

## 4. 実行

作ったリポジトリの`/actions/workflows/daily-update.yml`へ行くとRun Workflowがあるので、手動実行し、SQLiteがコミットされたら成功。

## バージョン更新

```sh
$ sh update.sh
```

```sh
$ git pull origin main
$ git pull upstream --no-ff
$ git push -f origin main
```
