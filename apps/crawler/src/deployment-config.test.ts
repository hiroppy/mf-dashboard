import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const readRepositoryFile = (filePath: string) =>
  readFileSync(path.join(repositoryRoot, filePath), "utf8");

const compose = readRepositoryFile("compose.yml");
const crawlerDockerfile = readRepositoryFile("docker/crawler/Dockerfile");
const dockerignore = readRepositoryFile(".dockerignore");
const envExample = readRepositoryFile(".env.example");
const terraform = readRepositoryFile("terraform/main.tf");
const tfvarsExample = readRepositoryFile("terraform/terraform.tfvars.example");
const webDockerfile = readRepositoryFile("docker/web/Dockerfile");

describe("Deployment configuration", () => {
  test("keeps infrastructure settings out of the application .env", () => {
    expect(envExample).not.toContain("CLOUDFLARE_");
    expect(envExample).not.toContain("GOOGLE_OAUTH_");
    expect(tfvarsExample).toContain("cloudflare_api_token");
    expect(tfvarsExample).toContain("google_oauth_client_id");
    expect(tfvarsExample).toContain("google_oauth_client_secret");
    expect(tfvarsExample).toContain("zone_name");
    expect(tfvarsExample).toContain("hostname");
  });

  test("passes the Terraform-managed tunnel token as a Compose secret", () => {
    const gitignore = readRepositoryFile(".gitignore");

    expect(terraform).toContain('resource "local_sensitive_file" "cloudflared_token"');
    expect(terraform).toContain(
      'filename             = "${path.module}/../secrets/cloudflared-token"',
    );
    expect(terraform).toContain('file_permission      = "0444"');
    expect(compose).toContain("--token-file /run/secrets/tunnel_token");
    expect(compose).toContain("file: ./secrets/cloudflared-token");
    expect(compose).not.toContain("file: ./data/cloudflared-token");
    expect(compose).not.toContain("TUNNEL_TOKEN:");
    expect(envExample).not.toContain("TUNNEL_TOKEN=");
    expect(gitignore).toContain("secrets/");
  });

  test("lets Terraform discover Cloudflare IDs and create the Google identity provider", () => {
    const terraformGitignore = readRepositoryFile("terraform/.gitignore");

    expect(terraform).toContain('data "cloudflare_zones" "selected"');
    expect(terraform).toContain(
      'resource "cloudflare_zero_trust_access_identity_provider" "google"',
    );
    expect(terraform).toContain(
      "allowed_idps              = [cloudflare_zero_trust_access_identity_provider.google.id]",
    );
    expect(envExample).not.toContain("CLOUDFLARE_HOSTNAME=");
    expect(tfvarsExample).toContain("hostname");
    expect(tfvarsExample).toContain("allowed_emails = [");
    expect(terraformGitignore).toContain("*.tfvars");
  });

  test("runs the crawler as the non-root image user without host UID overrides", () => {
    expect(compose).not.toContain("HOST_UID");
    expect(compose).not.toContain("HOST_GID");
    expect(compose).not.toContain("HOME: /tmp");
    expect(envExample).not.toContain("HOST_UID=");
    expect(envExample).not.toContain("HOST_GID=");
    expect(crawlerDockerfile).toContain("USER pwuser");
  });

  test("prepares the package manager pinned by the repository in Docker images", () => {
    for (const dockerfile of [webDockerfile, crawlerDockerfile]) {
      expect(dockerfile).toContain("COREPACK_HOME=/pnpm/corepack");
      expect(dockerfile).toContain(
        "package_manager=$(node -p \"require('./package.json').packageManager\")",
      );
      expect(dockerfile).toContain('corepack prepare "$package_manager" --activate');
      expect(dockerfile).not.toContain("pnpm@10.33.0");
    }
  });

  test("copies workspace manifests required by filtered Docker installs", () => {
    for (const dockerfile of [webDockerfile, crawlerDockerfile]) {
      const dateUtilsCopyIndex = dockerfile.indexOf(
        "COPY packages/date-utils/package.json ./packages/date-utils/",
      );
      const installIndex = dockerfile.indexOf("pnpm install --frozen-lockfile");

      expect(dateUtilsCopyIndex).toBeGreaterThanOrEqual(0);
      expect(dateUtilsCopyIndex).toBeLessThan(installIndex);
    }
  });

  test("keeps crawler-only Playwright browser downloads out of the web image install", () => {
    expect(webDockerfile).toContain(
      'pnpm install --frozen-lockfile --filter "@mf-dashboard/web..." --ignore-scripts',
    );
    expect(webDockerfile).toContain('pnpm rebuild --pending --filter "@mf-dashboard/web..."');
    expect(webDockerfile).toContain("RUN cd apps/web && ./node_modules/.bin/next build");
    expect(webDockerfile).toContain(
      'CMD ["/app/apps/web/node_modules/.bin/next", "start", "--port", "8765"]',
    );
  });

  test("stores crawler auth state outside the web data mount", () => {
    const webSection = compose.match(/  web:\n[\s\S]*?\n\n  cloudflared:/)?.[0] ?? "";
    const crawlerSection = compose.match(/  crawler:\n[\s\S]*?\n\nsecrets:/)?.[0] ?? "";

    expect(crawlerSection).toContain(
      "AUTH_STATE_PATH: ${AUTH_STATE_PATH:-/app/crawler-state/auth-state.json}",
    );
    expect(crawlerSection).toContain("- crawler_auth_state:/app/crawler-state");
    expect(compose).toContain("crawler_auth_state:");
    expect(webSection).not.toContain("crawler_auth_state");
    expect(webSection).not.toContain("/app/crawler-state");
    expect(crawlerDockerfile).toContain("mkdir -p /app/data /app/crawler-state /pnpm");
  });

  test("installs web build-time dependencies before setting production runtime env", () => {
    const installIndex = webDockerfile.indexOf("pnpm install --frozen-lockfile");
    const buildIndex = webDockerfile.indexOf("RUN cd apps/web && ./node_modules/.bin/next build");
    const productionEnvIndex = webDockerfile.indexOf("ENV NODE_ENV=production");

    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeGreaterThan(installIndex);
    expect(productionEnvIndex).toBeGreaterThan(buildIndex);
    expect(webDockerfile.slice(0, installIndex)).not.toContain("NODE_ENV=production");
  });

  test("keeps local financial artifacts out of Docker build contexts", () => {
    expect(dockerignore).toContain("data/*");
    expect(dockerignore).toContain("secrets/*");
    expect(dockerignore).toContain("apps/crawler/tests/e2e/*.db");
    expect(dockerignore).toContain("apps/crawler/tests/e2e/*.db-shm");
    expect(dockerignore).toContain("apps/crawler/tests/e2e/*.db-wal");
    expect(dockerignore).toContain("apps/crawler/tests/e2e/screenshots");
  });

  test("keeps all local Terraform variable files out of Docker build contexts", () => {
    expect(dockerignore).toContain("terraform/*.tfvars");
    expect(dockerignore).not.toContain("terraform/terraform.tfvars\n");
  });

  test("passes simulator initial amount through Docker build configuration", () => {
    expect(webDockerfile).toContain("ARG NEXT_PUBLIC_SIMULATOR_INITIAL_AMOUNT=");
    expect(webDockerfile).toContain(
      "NEXT_PUBLIC_SIMULATOR_INITIAL_AMOUNT=${NEXT_PUBLIC_SIMULATOR_INITIAL_AMOUNT}",
    );
    expect(compose).toContain(
      "NEXT_PUBLIC_SIMULATOR_INITIAL_AMOUNT: ${NEXT_PUBLIC_SIMULATOR_INITIAL_AMOUNT:-}",
    );
    expect(envExample).toContain("# NEXT_PUBLIC_SIMULATOR_INITIAL_AMOUNT=");
  });

  test("documents the Cloudflare permissions required to manage the Google identity provider", () => {
    const readme = readRepositoryFile("terraform/README.md");

    expect(readme).toContain("Access: Organizations, Identity Providers, and Groups:Edit");
  });
});
