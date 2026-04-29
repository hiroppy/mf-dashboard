# Terraform: Cloudflare Tunnel + Access

ローカル PC で配信する `apps/web/out` を Cloudflare Tunnel で外部公開し、Cloudflare Access (Google IdP + email allowlist) で保護するための Terraform。

## 前提

- `terraform` (>= 1.6)
- `op` CLI (1Password)
- Cloudflare アカウントの Zero Trust が有効化済み
- 公開先 FQDN の zone が Cloudflare で管理済み
- Google を Identity Provider として登録済み (Zero Trust > Settings > Authentication)
  - 未登録の場合、Access Application は IdP 制限なしで作られる
- Cloudflare API Token が発行済み (権限: `Account > Cloudflare Tunnel:Edit`, `Account > Access: Apps and Policies:Edit`, `Zone > DNS:Edit`)
  - 1Password に `API Credential` タイプで保存し、`credential` フィールドにトークンを入れる
  - 参照先: `op://Private/Cloudflare API Token mf-dashboard/credential`

## セットアップ

```sh
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars を実際の値に書き換える (.gitignore で除外済み)
```

## 適用

```sh
op run --env-file=.env.template -- terraform init
op run --env-file=.env.template -- terraform plan
op run --env-file=.env.template -- terraform apply
```

## Tunnel Token の取り出し (1Password へ保存)

`Cloudflare Tunnel mf-dashboard` という名前で **API Credential** アイテムを作成し、`credential` フィールドに以下のコマンドで書き込む:

```sh
op run --env-file=.env.template -- terraform output -raw tunnel_token \
  | op item edit "Cloudflare Tunnel mf-dashboard" "credential=$(cat)"
```

ローカル側ではこの token を `cloudflared tunnel run --token` に渡す (`scripts/start-tunnel.sh` 参照)。

## 破棄

```sh
op run --env-file=.env.template -- terraform destroy
```
