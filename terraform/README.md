# Terraform: Cloudflare Tunnel + Access

ローカル PC の Docker Compose (`web` / `cloudflared` / `crawler`) を Cloudflare Tunnel で外部公開し、Cloudflare Access (Google IdP + email allowlist) で保護するための Terraform。

## 前提

- `terraform` (>= 1.6)
- `op` CLI (1Password)
- Cloudflare アカウントの Zero Trust が有効化済み
- 公開先 FQDN の zone が Cloudflare で管理済み
- Google を Identity Provider として登録済み (Zero Trust > Settings > Authentication)
  - 未登録の場合、Access Application は IdP 制限なしで作られる
- Cloudflare API Token が発行済み (権限: `Account > Cloudflare Tunnel:Edit`, `Account > Access: Apps and Policies:Edit`, `Zone > DNS:Edit`)
  - 1Password に `API Credential` タイプで保存し、`credential` フィールドにトークンを入れる
  - リポジトリルートの `.env` に `CLOUDFLARE_API_TOKEN="op://Private/Cloudflare API Token mf-dashboard/credential"` を記述 (op run がコマンド実行時に解決する)

## セットアップ

```sh
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars を実際の値に書き換える (.gitignore で除外済み)
```

## 適用

すべてリポジトリルートから実行する。`-chdir=terraform` を付けることで `terraform/` 以下を作業ディレクトリとして扱う:

```sh
op run --env-file=.env -- terraform -chdir=terraform init
op run --env-file=.env -- terraform -chdir=terraform plan
op run --env-file=.env -- terraform -chdir=terraform apply
```

## Tunnel Token の取り出し

`terraform output` で得た token を、リポジトリルートの `.env` の `TUNNEL_TOKEN=...` に書き込む。`compose.yml` の `cloudflared` サービスが `env_file: .env` 経由でこれを読み、Cloudflare 公式イメージが起動時に `cloudflared tunnel run --token` 相当の挙動をする。

```sh
op run --env-file=.env -- terraform -chdir=terraform output -raw tunnel_token
# 出力をコピーして .env の TUNNEL_TOKEN に貼り付ける
```

## 破棄

```sh
op run --env-file=.env -- terraform -chdir=terraform destroy
```
