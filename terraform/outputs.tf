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

output "google_identity_provider_id" {
  description = "Cloudflare Access Google identity provider ID"
  value       = cloudflare_zero_trust_access_identity_provider.google.id
}

output "access_application_aud" {
  description = "Audience used to validate Cloudflare Access JWTs at the origin"
  value       = cloudflare_zero_trust_access_application.this.aud
}
