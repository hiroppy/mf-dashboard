output "tunnel_id" {
  description = "Cloudflare Tunnel ID"
  value       = cloudflare_zero_trust_tunnel_cloudflared.this.id
}

output "tunnel_cname_target" {
  description = "CNAME target the public hostname points at"
  value       = "${cloudflare_zero_trust_tunnel_cloudflared.this.id}.cfargotunnel.com"
}

output "hostname" {
  description = "Public hostname exposed by the tunnel"
  value       = var.hostname
}

output "tunnel_token" {
  description = "Token to pass to `cloudflared tunnel run --token`. Store in 1Password."
  value       = data.cloudflare_zero_trust_tunnel_cloudflared_token.this.token
  sensitive   = true
}

output "google_idp_detected" {
  description = "Whether a Google identity provider was found on this account"
  value       = local.google_idp_id != null
}
