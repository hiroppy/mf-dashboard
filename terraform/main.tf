resource "random_id" "tunnel_secret" {
  byte_length = 32
}

data "cloudflare_zones" "selected" {
  name      = var.zone_name
  status    = "active"
  max_items = 2
}

locals {
  zone       = one(data.cloudflare_zones.selected.result)
  zone_id    = local.zone.id
  account_id = local.zone.account.id
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "this" {
  account_id    = local.account_id
  name          = var.tunnel_name
  config_src    = "cloudflare"
  tunnel_secret = random_id.tunnel_secret.b64_std
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "this" {
  account_id = local.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.this.id

  config = {
    ingress = [
      {
        hostname = var.hostname
        service  = var.local_service_url
      },
      {
        service = "http_status:404"
      }
    ]
  }
}

resource "cloudflare_dns_record" "tunnel" {
  zone_id = local.zone_id
  name    = var.hostname
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.this.id}.cfargotunnel.com"
  ttl     = 1
  proxied = true
}

resource "cloudflare_zero_trust_access_identity_provider" "google" {
  account_id = local.account_id
  name       = "Google"
  type       = "google"

  config = {
    client_id     = var.google_oauth_client_id
    client_secret = var.google_oauth_client_secret
  }
}

resource "cloudflare_zero_trust_access_application" "this" {
  account_id                = local.account_id
  name                      = var.tunnel_name
  domain                    = var.hostname
  type                      = "self_hosted"
  session_duration          = var.session_duration
  allowed_idps              = [cloudflare_zero_trust_access_identity_provider.google.id]
  auto_redirect_to_identity = true

  policies = [
    {
      name       = "Allow specified emails"
      decision   = "allow"
      precedence = 1
      include = [
        for email in var.allowed_emails : {
          email = { email = email }
        }
      ]
    }
  ]
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "this" {
  account_id = local.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.this.id
}

resource "local_sensitive_file" "cloudflared_token" {
  content              = data.cloudflare_zero_trust_tunnel_cloudflared_token.this.token
  filename             = "${path.module}/../secrets/cloudflared-token"
  file_permission      = "0400"
  directory_permission = "0700"
}
