resource "random_id" "tunnel_secret" {
  byte_length = 32
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "this" {
  account_id    = var.account_id
  name          = var.tunnel_name
  config_src    = "cloudflare"
  tunnel_secret = random_id.tunnel_secret.b64_std
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "this" {
  account_id = var.account_id
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
  zone_id = var.zone_id
  name    = var.hostname
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.this.id}.cfargotunnel.com"
  ttl     = 1
  proxied = true
}

data "cloudflare_zero_trust_access_identity_providers" "all" {
  account_id = var.account_id
}

locals {
  google_idps = [
    for idp in data.cloudflare_zero_trust_access_identity_providers.all.result :
    idp.id if idp.type == "google"
  ]
  google_idp_id = length(local.google_idps) > 0 ? local.google_idps[0] : null
}

resource "cloudflare_zero_trust_access_application" "this" {
  account_id                = var.account_id
  name                      = var.tunnel_name
  domain                    = var.hostname
  type                      = "self_hosted"
  session_duration          = var.session_duration
  allowed_idps              = local.google_idp_id != null ? [local.google_idp_id] : []
  auto_redirect_to_identity = local.google_idp_id != null

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
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.this.id
}
