variable "cloudflare_api_token" {
  description = "Cloudflare API token used to provision this deployment"
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.cloudflare_api_token) > 0
    error_message = "cloudflare_api_token must not be empty."
  }
}

variable "google_oauth_client_id" {
  description = "Google OAuth client ID used by Cloudflare Access"
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.google_oauth_client_id) > 0
    error_message = "google_oauth_client_id must not be empty."
  }
}

variable "google_oauth_client_secret" {
  description = "Google OAuth client secret used by Cloudflare Access"
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.google_oauth_client_secret) > 0
    error_message = "google_oauth_client_secret must not be empty."
  }
}

variable "zone_name" {
  description = "Cloudflare zone containing the public hostname"
  type        = string
  validation {
    condition     = length(var.zone_name) > 0
    error_message = "zone_name must not be empty."
  }
}

variable "hostname" {
  description = "Public hostname to expose via Cloudflare Tunnel (FQDN, e.g. dashboard.example.com)"
  type        = string
  validation {
    condition     = length(var.hostname) > 0
    error_message = "hostname must not be empty."
  }
}

variable "allowed_emails" {
  description = "List of email addresses allowed by Cloudflare Access"
  type        = list(string)
  validation {
    condition     = length(var.allowed_emails) > 0
    error_message = "allowed_emails must contain at least one email address."
  }
}

variable "tunnel_name" {
  description = "Cloudflare Tunnel name"
  type        = string
  default     = "mf-dashboard"
}

variable "local_service_url" {
  description = "URL the cloudflared connector forwards traffic to. Default targets the Docker Compose `web` service over the bridge network; switch to http://localhost:8765 only when running cloudflared with host networking."
  type        = string
  default     = "http://web:8765"
}

variable "session_duration" {
  description = "Cloudflare Access session duration (e.g. 30m, 6h, 24h)"
  type        = string
  default     = "24h"
  validation {
    condition     = can(regex("^[0-9]+(m|h)$", var.session_duration))
    error_message = "session_duration must look like '30m' or '24h'."
  }
}
