#!/usr/bin/env bash
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ENV_FILE="$REPO_ROOT/.env"
TFVARS_FILE="$REPO_ROOT/terraform/terraform.tfvars"

APPLY_TERRAFORM=1
START_DOCKER=1
RUN_CRAWLER=0

usage() {
  cat <<'USAGE'
Usage: scripts/setup-cloudflare-tunnel.sh [options]

Bootstraps local Docker Compose + Cloudflare Tunnel deployment.

Options:
  --no-apply     Generate/update files and run terraform init/plan, but skip apply.
  --no-docker    Skip docker compose build/up.
  --run-crawler  Run the crawler once after docker compose up.
  -h, --help     Show this help.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-apply)
      APPLY_TERRAFORM=0
      ;;
    --no-docker)
      START_DOCKER=0
      ;;
    --run-crawler)
      RUN_CRAWLER=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

say() { printf '\n==> %s\n' "$*"; }
warn() { printf '\n[WARN] %s\n' "$*" >&2; }
die() { printf '\n[ERROR] %s\n' "$*" >&2; exit 1; }

need_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

prompt() {
  label=$1
  default=${2:-}
  if [ -n "$default" ]; then
    printf '%s [%s]: ' "$label" "$default" >&2
  else
    printf '%s: ' "$label" >&2
  fi
  IFS= read -r answer
  if [ -z "$answer" ]; then
    printf '%s' "$default"
  else
    printf '%s' "$answer"
  fi
}

confirm() {
  label=$1
  default=${2:-y}
  answer=$(prompt "$label" "$default")
  case "$answer" in
    y|Y|yes|YES|Yes) return 0 ;;
    *) return 1 ;;
  esac
}

prompt_secret() {
  label=$1
  printf '%s: ' "$label" >&2
  stty -echo
  IFS= read -r answer
  stty echo
  printf '\n' >&2
  printf '%s' "$answer"
}

ensure_env_value() {
  key=$1
  label=$2
  secret=${3:-0}
  if grep -q "^${key}=." "$ENV_FILE"; then
    return 0
  fi
  if [ "$secret" -eq 1 ]; then
    value=$(prompt_secret "$label")
  else
    value=$(prompt "$label" "")
  fi
  [ -n "$value" ] || die "$key is required"
  set_env_key "$key" "$value"
}

set_env_key() {
  key=$1
  value=$2
  node - "$ENV_FILE" "$key" "$value" <<'NODE'
const fs = require('node:fs');
const [file, key, value] = process.argv.slice(2);
let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const line = `${key}=${value}`;
const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const re = new RegExp(`^${escaped}=.*$`, 'm');
if (re.test(text)) {
  text = text.replace(re, line);
} else {
  if (text.length > 0 && !text.endsWith('\n')) text += '\n';
  text += `${line}\n`;
}
fs.writeFileSync(file, text);
NODE
}

json_extract_zone() {
  node -e '
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);
    if (!data.success || !Array.isArray(data.result) || data.result.length === 0) process.exit(2);
    const zone = data.result[0];
    if (!zone.id || !zone.account || !zone.account.id) process.exit(2);
    console.log([zone.id, zone.account.id, zone.name].join("\t"));
  } catch {
    process.exit(2);
  }
});
'
}

json_escape() {
  node -e 'console.log(JSON.stringify(process.argv[1]))' "$1"
}

write_tfvars() {
  account_id=$1
  zone_id=$2
  hostname=$3
  allowed_emails=$4

  if [ -f "$TFVARS_FILE" ]; then
    backup="$TFVARS_FILE.bak.$(date +%Y%m%d%H%M%S)"
    cp "$TFVARS_FILE" "$backup"
    warn "Existing terraform.tfvars backed up to $backup"
  fi

  {
    printf 'account_id = %s\n' "$(json_escape "$account_id")"
    printf 'zone_id    = %s\n' "$(json_escape "$zone_id")"
    printf 'hostname   = %s\n\n' "$(json_escape "$hostname")"
    printf 'allowed_emails = [\n'
    old_ifs=$IFS
    IFS=','
    for email in $allowed_emails; do
      IFS=$old_ifs
      trimmed=$(printf '%s' "$email" | xargs)
      if [ -n "$trimmed" ]; then
        printf '  %s,\n' "$(json_escape "$trimmed")"
      fi
      IFS=','
    done
    IFS=$old_ifs
    printf ']\n'
  } > "$TFVARS_FILE"
}

resolve_cloudflare_token() {
  token=$(op run --env-file="$ENV_FILE" -- printenv CLOUDFLARE_API_TOKEN 2>/dev/null || true)
  if [ -z "$token" ]; then
    return 1
  fi
  printf '%s' "$token"
}

cf_get() {
  path=$1
  auth_header=$(printf 'Authorization: Bearer %s' "$CF_TOKEN")
  curl -fsS \
    -H "$auth_header" \
    -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/$path"
}

auto_detect_zone() {
  hostname=$1
  labels=$hostname
  while printf '%s' "$labels" | grep -q '\.'; do
    response=$(cf_get "zones?name=$labels&per_page=1" 2>/dev/null || true)
    if [ -n "$response" ]; then
      extracted=$(printf '%s' "$response" | json_extract_zone 2>/dev/null || true)
      if [ -n "$extracted" ]; then
        printf '%s' "$extracted"
        return 0
      fi
    fi
    labels=${labels#*.}
  done
  return 1
}

cd "$REPO_ROOT"

need_command node
need_command op
need_command terraform
need_command curl
need_command openssl
if [ "$START_DOCKER" -eq 1 ]; then
  need_command docker
fi

if [ ! -f "$ENV_FILE" ]; then
  say "Creating .env from .env.example"
  cp "$REPO_ROOT/.env.example" "$ENV_FILE"
fi

if ! grep -q '^CLOUDFLARE_API_TOKEN=' "$ENV_FILE"; then
  set_env_key CLOUDFLARE_API_TOKEN '"op://Private/Cloudflare API Token mf-dashboard/credential"'
fi

if ! grep -q '^REFRESH_TOKEN=.' "$ENV_FILE"; then
  say "Generating REFRESH_TOKEN"
  set_env_key REFRESH_TOKEN "$(openssl rand -hex 32)"
fi

if ! grep -q '^WEB_URL=.' "$ENV_FILE"; then
  set_env_key WEB_URL 'http://web:8765'
fi

if [ "$START_DOCKER" -eq 1 ]; then
  say "Checking MoneyForward / 1Password environment values"
  ensure_env_value OP_SERVICE_ACCOUNT_TOKEN "OP_SERVICE_ACCOUNT_TOKEN" 1
  ensure_env_value OP_VAULT "OP_VAULT (1Password vault UUID)" 0
  ensure_env_value OP_ITEM "OP_ITEM (MoneyForward item UUID)" 0
  ensure_env_value OP_TOTP_FIELD "OP_TOTP_FIELD (TOTP field UUID)" 0
fi

say "Resolving Cloudflare API token via 1Password"
CF_TOKEN=$(resolve_cloudflare_token) || die "Could not resolve CLOUDFLARE_API_TOKEN. Create a Cloudflare API Token in 1Password and set CLOUDFLARE_API_TOKEN in .env."

hostname=$(prompt "Public hostname" "dashboard.example.com")
[ -n "$hostname" ] || die "hostname is required"
allowed_emails=$(prompt "Allowed email(s), comma-separated" "you@example.com")
[ -n "$allowed_emails" ] || die "allowed_emails is required"

say "Detecting Cloudflare zone/account from hostname"
zone_info=$(auto_detect_zone "$hostname" || true)
if [ -n "$zone_info" ]; then
  zone_id=$(printf '%s' "$zone_info" | cut -f1)
  account_id=$(printf '%s' "$zone_info" | cut -f2)
  zone_name=$(printf '%s' "$zone_info" | cut -f3)
  say "Using Cloudflare zone $zone_name"
else
  warn "Could not auto-detect zone/account. The API token may not have read permissions."
  account_id=$(prompt "Cloudflare Account ID" "")
  zone_id=$(prompt "Cloudflare Zone ID" "")
  [ -n "$account_id" ] || die "account_id is required"
  [ -n "$zone_id" ] || die "zone_id is required"
fi

say "Writing terraform/terraform.tfvars"
write_tfvars "$account_id" "$zone_id" "$hostname" "$allowed_emails"

say "Running terraform init"
op run --env-file="$ENV_FILE" -- terraform -chdir=terraform init

say "Running terraform plan"
op run --env-file="$ENV_FILE" -- terraform -chdir=terraform plan

if [ "$APPLY_TERRAFORM" -eq 1 ]; then
  if confirm "Apply Terraform now?" "y"; then
    say "Applying Terraform"
    op run --env-file="$ENV_FILE" -- terraform -chdir=terraform apply -auto-approve
    say "Writing TUNNEL_TOKEN to .env"
    tunnel_token=$(op run --env-file="$ENV_FILE" -- terraform -chdir=terraform output -raw tunnel_token)
    set_env_key TUNNEL_TOKEN "$tunnel_token"
  else
    warn "Skipped terraform apply. Run it later, then write TUNNEL_TOKEN to .env."
  fi
else
  warn "Skipped terraform apply because --no-apply was specified."
fi

if [ "$START_DOCKER" -eq 1 ]; then
  if confirm "Build and start Docker Compose services now?" "y"; then
    say "Starting Docker Compose"
    docker compose build
    docker compose up -d
    if [ "$RUN_CRAWLER" -eq 1 ] || confirm "Run crawler once now?" "n"; then
      say "Running crawler once"
      docker compose exec crawler pnpm --filter @mf-dashboard/crawler start
    fi
  else
    warn "Skipped Docker Compose startup."
  fi
fi

say "Done"
cat <<EOF

Next checks:
  docker compose ps
  docker compose logs -f cloudflared
  curl -I https://$hostname/
EOF
