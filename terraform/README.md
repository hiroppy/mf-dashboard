# Terraform: Cloudflare Tunnel + Access

ローカル PC の Docker Compose (`web` / `cloudflared` / `crawler`) を Cloudflare Tunnel で外部公開し、Cloudflare Access (Google IdP + email allowlist) で保護するための Terraform。

## 前提

- `terraform` (>= 1.6)
- Cloudflare アカウントの Zero Trust が有効化済み
- 公開先 FQDN の zone が Cloudflare で管理済み
- Google Cloud Console で OAuth consent screen と Web Application client を作成済み
- Cloudflare API Token が発行済み (権限: `Account > Cloudflare Tunnel:Edit`, `Account > Access: Apps and Policies:Edit`, `Account > Access: Organizations, Identity Providers, and Groups:Edit`, `Zone > Zone:Read`, `Zone > DNS:Edit`)
- `terraform/terraform.tfvars` に Cloudflare API token、Google OAuth client、zone、hostname、Access allowlist を設定する

## セットアップ

リポジトリルートでインフラ設定を作成する:

```sh
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
# terraform.tfvars の全項目を設定する (.gitignore で除外済み)
```

## 適用

すべてリポジトリルートから実行する。`-chdir=terraform` を付けることで `terraform/` 以下を作業ディレクトリとして扱う:

```sh
terraform -chdir=terraform init
terraform -chdir=terraform plan
terraform -chdir=terraform apply
```

## Tunnel Token の受け渡し

Terraform の `local_sensitive_file` が app 共有 data volume とは別の `secrets/cloudflared-token` を mode `444` で作成する。`compose.yml` はこのファイルを Compose secret として mount し、`cloudflared tunnel run --token-file` で使用する。mode `444` は `cloudflare/cloudflared` image の non-root UID が secret file を読めるようにするため。

`terraform.tfvars`、Terraform state、`secrets/cloudflared-token` は Git 管理対象外。すべて秘密情報として扱う。

## 破棄

```sh
terraform -chdir=terraform destroy
```
