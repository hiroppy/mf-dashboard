terraform {
  required_version = "~> 1.6"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "cloudflare" {
  # api_token は環境変数 CLOUDFLARE_API_TOKEN から読まれる
}
