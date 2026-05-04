variable "account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "zone_id" {
  description = "Cloudflare Zone ID for the hostname's parent domain"
  type        = string
}

variable "hostname" {
  description = "Public hostname to expose via Cloudflare Tunnel (FQDN, e.g. dashboard.example.com)"
  type        = string
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
